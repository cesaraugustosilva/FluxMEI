import { strFromU8, unzipSync } from 'fflate';
import { supabaseAdmin } from '../config/supabase.js';
import { AppError } from '../middlewares/errorMiddleware.js';
import { detectBank, getImporter } from './importers/bankDetector.js';
import { calculateConfidence, suggestCategory } from './reconciliationService.js';
import { sanitizeText, validateDate } from '../utils/validation.js';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(['csv', 'ofx', 'xlsx']);
const DESCRIPTION_HEADERS = ['descricao', 'description', 'historico', 'memo', 'name', 'descricao lancamento'];
const DATE_HEADERS = ['data', 'date', 'dtposted'];
const VALUE_HEADERS = ['valor', 'value', 'amount', 'trnamt'];
const TYPE_HEADERS = ['tipo', 'type'];
const CATEGORY_HEADERS = ['categoria', 'category'];

function normalizeKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeDescription(value = '') {
  return normalizeKey(value).replace(/\s+/g, ' ');
}

function inferFileType(filename = '', fileType = '') {
  const explicit = normalizeKey(fileType).replace(/\s+/g, '');
  if (SUPPORTED_TYPES.has(explicit)) return explicit;
  const ext = String(filename).split('.').pop()?.toLowerCase();
  if (SUPPORTED_TYPES.has(ext)) return ext;
  throw new AppError('Formato de arquivo nao suportado.');
}

function contentBytes(content = '') {
  return Buffer.byteLength(String(content), 'utf8');
}

function assertSafeInput({ filename, fileType, content }) {
  const safeFilename = sanitizeText(filename, { field: 'Nome do arquivo', required: true, max: 180, rejectDangerous: true });
  const safeType = inferFileType(safeFilename, fileType);

  if (typeof content !== 'string' || !content.trim()) {
    throw new AppError('Conteudo do arquivo e obrigatorio.');
  }
  if (contentBytes(content) > MAX_FILE_BYTES * 1.45) {
    throw new AppError('Arquivo muito grande. Envie um arquivo de ate 2MB.');
  }

  return { filename: safeFilename, fileType: safeType };
}

function decodeTextContent(content) {
  return String(content).replace(/^\uFEFF/, '');
}

function parseCsvLine(line, separator) {
  const cells = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === separator && !quoted) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function detectSeparator(lines) {
  const sample = lines.find((line) => line.trim()) || '';
  const commaCount = (sample.match(/,/g) || []).length;
  const semicolonCount = (sample.match(/;/g) || []).length;
  return semicolonCount > commaCount ? ';' : ',';
}

function findValue(row, headers) {
  for (const header of headers) {
    if (row[header] !== undefined && row[header] !== null && String(row[header]).trim() !== '') return row[header];
  }
  return null;
}

function parseDelimitedRows(content) {
  const lines = decodeTextContent(content)
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) throw new AppError('CSV sem linhas para importar.');

  const separator = detectSeparator(lines);
  const headers = parseCsvLine(lines[0], separator).map(normalizeKey);
  const rows = lines.slice(1).map((line) => {
    const cells = parseCsvLine(line, separator);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
  });
  return { headers, rows };
}

function parseMoney(value) {
  if (typeof value === 'number') return value;
  let text = String(value ?? '').trim();
  if (!text) throw new AppError('Valor invalido no arquivo.');

  let sign = 1;
  if (/^\(.*\)$/.test(text)) sign = -1;
  text = text
    .replace(/[()]/g, '')
    .replace(/\s/g, '')
    .replace(/R\$/gi, '');
  if (text.startsWith('-')) sign = -1;
  text = text.replace(/^[+-]/, '');

  const comma = text.lastIndexOf(',');
  const dot = text.lastIndexOf('.');
  if (comma > -1 && dot > -1) {
    text = comma > dot ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '');
  } else if (comma > -1) {
    text = text.replace(/\./g, '').replace(',', '.');
  }

  const number = Number(text);
  if (!Number.isFinite(number)) throw new AppError('Valor invalido no arquivo.');
  return sign * number;
}

function parseDateValue(value) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return validateDate(text);
  if (/^\d{8}/.test(text)) {
    const date = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
    return validateDate(date);
  }
  const br = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    const date = `${year}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    return validateDate(date);
  }
  throw new AppError('Data invalida no arquivo.');
}

function inferTipo(rawTipo, signedValue) {
  const tipo = normalizeKey(rawTipo || '');
  if (['entrada', 'receita', 'credito', 'credit', 'c'].includes(tipo)) return 'entrada';
  if (['saida', 'despesa', 'debito', 'debit', 'd'].includes(tipo)) return 'saida';
  return signedValue < 0 ? 'saida' : 'entrada';
}

export function categorizeDescription(description = '') {
  return suggestCategory({ descricao: description });
}

function sanitizeImportedText(value, field, max) {
  return sanitizeText(String(value ?? ''), { field, required: true, max, rejectDangerous: true });
}

function mapRowToMovement(row, index) {
  const date = parseDateValue(findValue(row, DATE_HEADERS));
  const signedValue = parseMoney(findValue(row, VALUE_HEADERS));
  const descriptionSource = findValue(row, DESCRIPTION_HEADERS);
  const descricao = sanitizeImportedText(descriptionSource || `Lancamento ${index + 1}`, 'Descricao', 180);
  const tipo = inferTipo(findValue(row, TYPE_HEADERS), signedValue);
  const category = findValue(row, CATEGORY_HEADERS);
  const categoria = category
    ? sanitizeImportedText(category, 'Categoria', 80)
    : categorizeDescription(descricao);

  return {
    data: date,
    descricao,
    valor: Math.abs(Number(signedValue.toFixed(2))),
    tipo,
    categoria,
    external_id: row.external_id ? sanitizeText(String(row.external_id), { field: 'ID externo', max: 120, rejectDangerous: true }) : null
  };
}

function parseCsv(content) {
  return parseDelimitedRows(content);
}

function extractOfxTags(block, tag) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function parseOfx(content) {
  const text = decodeTextContent(content);
  const blocks = text.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|<\/STMTTRN>)/gi) || [];
  if (!blocks.length) throw new AppError('OFX sem transacoes para importar.');

  const rows = blocks.map((block) => ({
    dtposted: extractOfxTags(block, 'DTPOSTED'),
    trnamt: extractOfxTags(block, 'TRNAMT'),
    memo: extractOfxTags(block, 'MEMO') || extractOfxTags(block, 'NAME'),
    external_id: extractOfxTags(block, 'FITID')
  }));

  return {
    headers: ['dtposted', 'trnamt', 'memo', 'external_id'],
    rows
  };
}

function parseXlsx(content) {
  let files;
  try {
    const buffer = Buffer.from(content, 'base64');
    if (buffer.length > MAX_FILE_BYTES) throw new AppError('Arquivo muito grande. Envie um arquivo de ate 2MB.');
    files = unzipSync(new Uint8Array(buffer));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Nao foi possivel ler o XLSX.');
  }

  const sheetPath = Object.keys(files).find((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name));
  if (!sheetPath) throw new AppError('XLSX sem planilhas.');

  const sharedStrings = parseSharedStrings(files['xl/sharedStrings.xml']);
  const sheetRows = parseWorksheetXml(strFromU8(files[sheetPath]), sharedStrings);
  const headers = (sheetRows[0] || []).map(normalizeKey);
  const rows = sheetRows.slice(1)
    .filter((cells) => cells.some((cell) => String(cell || '').trim()))
    .map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));

  if (!rows.length) throw new AppError('XLSX sem linhas para importar.');
  return { headers, rows };
}

function xmlDecode(value = '') {
  return String(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function parseSharedStrings(file) {
  if (!file) return [];
  const xml = strFromU8(file);
  return [...xml.matchAll(/<si\b[^>]*>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/si>/gi)]
    .map((match) => xmlDecode(match[1]));
}

function columnIndex(ref = '') {
  const letters = String(ref).match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';
  return [...letters].reduce((sum, char) => (sum * 26) + char.charCodeAt(0) - 64, 0) - 1;
}

function cellValue(attrs, body, sharedStrings) {
  const type = attrs.match(/\bt="([^"]+)"/i)?.[1] || '';
  if (type === 'inlineStr') {
    return xmlDecode(body.match(/<t[^>]*>([\s\S]*?)<\/t>/i)?.[1] || '');
  }
  const raw = xmlDecode(body.match(/<v[^>]*>([\s\S]*?)<\/v>/i)?.[1] || '');
  if (type === 's') return sharedStrings[Number(raw)] || '';
  return raw;
}

function parseWorksheetXml(xml, sharedStrings) {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/gi)].map((rowMatch) => {
    const cells = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
      const attrs = cellMatch[1];
      const ref = attrs.match(/\br="([^"]+)"/i)?.[1] || '';
      const index = columnIndex(ref);
      if (index >= 0) cells[index] = cellValue(attrs, cellMatch[2], sharedStrings);
    }
    return cells;
  });
}

export function parseBankStatement({ filename, file_type: fileType, content }) {
  const safe = assertSafeInput({ filename, fileType, content });
  const parsed = safe.fileType === 'csv'
    ? parseCsv(content)
    : safe.fileType === 'ofx'
      ? parseOfx(content)
      : parseXlsx(content);
  const detection = detectBank(safe.filename, parsed.headers, content);
  const importer = getImporter(detection.importerId);
  const rows = parsed.rows.map((row, index) => mapRowToMovement(importer.adaptRow(row), index));

  if (!rows.length) throw new AppError('Nenhuma movimentacao encontrada no arquivo.');
  return {
    ...safe,
    rows,
    bank_name: detection.bankName,
    parser_used: detection.parserUsed,
    confidence: detection.confidence,
    optimized_import: detection.optimized
  };
}

function movementKey(item) {
  return `${item.data}|${Number(item.valor).toFixed(2)}|${normalizeDescription(item.descricao)}`;
}

async function createImportRecord(userId, parsed) {
  const { data, error } = await supabaseAdmin
    .from('bank_imports')
    .insert({
      user_id: userId,
      filename: parsed.filename,
      file_type: parsed.fileType,
      bank_name: parsed.bank_name,
      parser_used: parsed.parser_used,
      confidence: parsed.confidence,
      status: 'processing',
      total_rows: parsed.rows.length,
      imported_count: 0,
      skipped_count: 0
    })
    .select()
    .single();

  if (error) throw new AppError('Erro ao registrar importacao.', 500, error.message);
  return data;
}

async function updateImportRecord(importId, payload) {
  const { data, error } = await supabaseAdmin
    .from('bank_imports')
    .update(payload)
    .eq('id', importId)
    .select()
    .single();

  if (error) throw new AppError('Erro ao atualizar importacao.', 500, error.message);
  return data;
}

async function existingMovementSets(userId) {
  const { data, error } = await supabaseAdmin
    .from('movimentacoes')
    .select('data,valor,descricao,external_id')
    .eq('user_id', userId);

  if (error) throw new AppError('Erro ao verificar duplicatas.', 500, error.message);
  return {
    externalIds: new Set((data || []).map((item) => item.external_id).filter(Boolean)),
    keys: new Set((data || []).map(movementKey))
  };
}

export async function importBankStatement(userId, payload) {
  const parsed = parseBankStatement(payload);
  const importRecord = await createImportRecord(userId, parsed);

  try {
    const existing = await existingMovementSets(userId);
    const batchExternalIds = new Set();
    const batchKeys = new Set();
    const movements = [];
    let skipped = 0;

    for (const item of parsed.rows) {
      const ext = item.external_id;
      const key = movementKey(item);
      const duplicate = (ext && (existing.externalIds.has(ext) || batchExternalIds.has(ext)))
        || existing.keys.has(key)
        || batchKeys.has(key);

      if (duplicate) {
        skipped += 1;
        continue;
      }

      if (ext) batchExternalIds.add(ext);
      batchKeys.add(key);
      const aiCategorySuggestion = suggestCategory(item);
      const categoryConfidence = calculateConfidence(item);
      movements.push({
        user_id: userId,
        import_id: importRecord.id,
        external_id: ext,
        source: 'bank_import',
        reconciliation_status: 'imported',
        ai_category_suggestion: aiCategorySuggestion,
        category_confidence: categoryConfidence,
        tipo: item.tipo,
        descricao: item.descricao,
        valor: item.valor,
        categoria: item.categoria,
        forma_pagamento: 'importacao',
        observacao: `Importado de ${parsed.filename}`,
        data: item.data
      });
    }

    if (movements.length) {
      const { error } = await supabaseAdmin.from('movimentacoes').insert(movements).select();
      if (error) throw new AppError('Erro ao salvar movimentacoes importadas.', 500, error.message);
    }

    const finalRecord = await updateImportRecord(importRecord.id, {
      status: 'completed',
      imported_count: movements.length,
      skipped_count: skipped,
      error_message: null
    });

    return {
      import: finalRecord,
      total_rows: parsed.rows.length,
      imported_count: movements.length,
      skipped_count: skipped,
      bank_name: parsed.bank_name,
      parser_used: parsed.parser_used,
      confidence: parsed.confidence,
      optimized_import: parsed.optimized_import
    };
  } catch (error) {
    await updateImportRecord(importRecord.id, {
      status: 'failed',
      imported_count: 0,
      skipped_count: parsed.rows.length,
      error_message: error.message || 'Erro ao importar extrato.'
    });
    throw error;
  }
}

export async function listBankImportHistory(userId) {
  const { data, error } = await supabaseAdmin
    .from('bank_imports')
    .select('id,filename,file_type,status,total_rows,imported_count,skipped_count,error_message,bank_name,parser_used,confidence,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw new AppError('Erro ao listar historico de importacoes.', 500, error.message);
  return data || [];
}

function average(values) {
  const valid = values.map(Number).filter((value) => Number.isFinite(value));
  if (!valid.length) return 0;
  return Number((valid.reduce((sum, value) => sum + value, 0) / valid.length).toFixed(2));
}

function buildBankSummary(imports) {
  const map = new Map();
  for (const item of imports) {
    const bank = item.bank_name || 'Banco nao identificado';
    map.set(bank, (map.get(bank) || 0) + 1);
  }

  return [...map.entries()]
    .map(([bank_name, count]) => ({ bank_name, count }))
    .sort((a, b) => b.count - a.count || a.bank_name.localeCompare(b.bank_name));
}

function countStatus(movements, status) {
  return movements.filter((item) => item.reconciliation_status === status).length;
}

function mapRecentImport(item) {
  return {
    id: item.id,
    filename: item.filename,
    file_type: item.file_type,
    bank_name: item.bank_name || 'Banco nao identificado',
    parser_used: item.parser_used || 'Parser Generico',
    confidence: Number(item.confidence || 0),
    imported_count: Number(item.imported_count || 0),
    skipped_count: Number(item.skipped_count || 0),
    created_at: item.created_at
  };
}

export async function getImportDashboard(userId) {
  const [importsResult, movementsResult] = await Promise.all([
    supabaseAdmin
      .from('bank_imports')
      .select('id,filename,file_type,status,total_rows,imported_count,skipped_count,bank_name,parser_used,confidence,created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('movimentacoes')
      .select('id,import_id,reconciliation_status,category_confidence,duplicate_of')
      .eq('user_id', userId)
      .eq('source', 'bank_import')
  ]);

  if (importsResult.error) throw new AppError('Erro ao carregar dashboard de importacoes.', 500, importsResult.error.message);
  if (movementsResult.error) throw new AppError('Erro ao carregar movimentacoes importadas.', 500, movementsResult.error.message);

  const imports = importsResult.data || [];
  const movements = movementsResult.data || [];
  const banks = buildBankSummary(imports);
  const duplicated = movements.filter((item) => item.reconciliation_status === 'duplicated' || item.duplicate_of).length;
  const pendingReview = movements.filter((item) => !item.reconciliation_status || item.reconciliation_status === 'imported').length;
  const reviewed = ['reviewed', 'reconciled'].reduce((sum, status) => sum + countStatus(movements, status), 0);

  return {
    total_imports: imports.length,
    total_imported_movements: movements.length,
    total_skipped: imports.reduce((sum, item) => sum + Number(item.skipped_count || 0), 0),
    pending_review: pendingReview,
    reviewed,
    probable_duplicates: duplicated,
    identified_banks: banks,
    latest_import: imports[0] ? mapRecentImport(imports[0]) : null,
    parser_confidence_avg: average(imports.map((item) => item.confidence)),
    category_confidence_avg: average(movements.map((item) => item.category_confidence)),
    recent_imports: imports.slice(0, 5).map(mapRecentImport)
  };
}
