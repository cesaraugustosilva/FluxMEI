import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const templatesDir = path.join(rootDir, 'frontend', 'assets', 'import-templates');
const appHtml = fs.readFileSync(path.join(rootDir, 'frontend', 'app', 'index.html'), 'utf8');

const expectedTemplates = [
  'nubank-modelo.csv',
  'inter-modelo.csv',
  'mercado-pago-modelo.csv',
  'c6-modelo.csv',
  'banco-do-brasil-modelo.csv',
  'caixa-modelo.csv',
  'itau-modelo.csv',
  'bradesco-modelo.csv',
  'santander-modelo.csv',
  'generico-modelo.csv'
];

test('arquivos de modelo CSV por banco existem', () => {
  const missing = expectedTemplates.filter((file) => !fs.existsSync(path.join(templatesDir, file)));

  assert.deepEqual(missing, []);
});

test('modelos CSV possuem cabecalho e duas linhas ficticias', () => {
  const invalid = expectedTemplates.filter((file) => {
    const lines = fs.readFileSync(path.join(templatesDir, file), 'utf8').trim().split(/\r?\n/);
    return lines.length !== 3 || !/data|date|dt lancamento|data mov|data lancamento/i.test(lines[0]);
  });

  assert.deepEqual(invalid, []);
});

test('modelos nao contem dados reais sensiveis', () => {
  const sensitivePattern = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b(?:\d[ -]*?){13,19}\b|senha|password|token|secret|cvv|cvc/i;
  const offenders = expectedTemplates.filter((file) => {
    const content = fs.readFileSync(path.join(templatesDir, file), 'utf8');
    return sensitivePattern.test(content);
  });

  assert.deepEqual(offenders, []);
});

test('secao de modelos aparece no frontend com bancos suportados', () => {
  for (const label of ['Modelos de importacao', 'Nubank', 'Banco Inter', 'Mercado Pago', 'C6 Bank', 'Banco do Brasil', 'Caixa', 'Itau', 'Bradesco', 'Santander', 'Generico']) {
    assert.match(appHtml, new RegExp(label));
  }
  assert.match(appHtml, /Sem Open Finance pago/);
  assert.match(appHtml, /Nunca envie sua senha bancaria/);
  assert.match(appHtml, /FluxMEI nao acessa sua conta bancaria/);
});

test('botoes de modelo apontam para arquivos CSV existentes', () => {
  const links = [...appHtml.matchAll(/href="\/assets\/import-templates\/([^"]+\.csv)"/g)]
    .map((match) => match[1]);
  const missing = links.filter((file) => !fs.existsSync(path.join(templatesDir, file)));

  assert.deepEqual(new Set(links), new Set(expectedTemplates));
  assert.deepEqual(missing, []);
});
