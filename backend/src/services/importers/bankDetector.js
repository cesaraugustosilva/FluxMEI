import { normalizeImportKey } from './baseImporter.js';
import { bbImporter } from './bbImporter.js';
import { bradescoImporter } from './bradescoImporter.js';
import { c6Importer } from './c6Importer.js';
import { caixaImporter } from './caixaImporter.js';
import { genericImporter } from './genericImporter.js';
import { interImporter } from './interImporter.js';
import { itauImporter } from './itauImporter.js';
import { mercadoPagoImporter } from './mercadoPagoImporter.js';
import { nubankImporter } from './nubankImporter.js';
import { santanderImporter } from './santanderImporter.js';

export const importersById = {
  [genericImporter.id]: genericImporter,
  [nubankImporter.id]: nubankImporter,
  [interImporter.id]: interImporter,
  [mercadoPagoImporter.id]: mercadoPagoImporter,
  [c6Importer.id]: c6Importer,
  [bbImporter.id]: bbImporter,
  [caixaImporter.id]: caixaImporter,
  [itauImporter.id]: itauImporter,
  [bradescoImporter.id]: bradescoImporter,
  [santanderImporter.id]: santanderImporter
};

const BANK_RULES = [
  { importer: nubankImporter, words: ['nubank', 'nu pagamentos', 'nu conta', 'roxinho'], headers: ['title', 'amount'] },
  { importer: interImporter, words: ['banco inter', 'intermedium', 'inter pj'], headers: ['data lancamento', 'tipo operacao'] },
  { importer: mercadoPagoImporter, words: ['mercado pago', 'mercadopago', 'mercado livre'], headers: ['numero de operacao', 'valor liquido'] },
  { importer: c6Importer, words: ['c6 bank', 'banco c6', 'c6'], headers: ['natureza'] },
  { importer: bbImporter, words: ['banco do brasil', 'bb s a', '001 banco'], headers: ['dt lancamento'] },
  { importer: caixaImporter, words: ['caixa economica', 'caixa federal', 'cef'], headers: ['data mov', 'data movimento'] },
  { importer: itauImporter, words: ['itau', 'itaú', '341'], headers: ['lancamento'] },
  { importer: bradescoImporter, words: ['bradesco', '237'], headers: ['debito credito'] },
  { importer: santanderImporter, words: ['santander', '033'], headers: ['data lancamento'] }
];

function scoreRule(rule, haystack, normalizedHeaders) {
  let score = 0;
  for (const word of rule.words) {
    if (haystack.includes(normalizeImportKey(word))) score += 0.55;
  }
  for (const header of rule.headers || []) {
    if (normalizedHeaders.includes(normalizeImportKey(header))) score += 0.16;
  }
  return Math.min(0.99, score);
}

export function detectBank(fileName = '', headers = [], content = '') {
  const normalizedHeaders = headers.map(normalizeImportKey).filter(Boolean);
  const haystack = normalizeImportKey([
    fileName,
    normalizedHeaders.join(' '),
    String(content || '').slice(0, 5000)
  ].join(' '));

  const ranked = BANK_RULES
    .map((rule) => ({ importer: rule.importer, confidence: scoreRule(rule, haystack, normalizedHeaders) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0];

  if (!best || best.confidence < 0.5) {
    return {
      bankName: genericImporter.bankName,
      parserUsed: genericImporter.parserName,
      importerId: genericImporter.id,
      confidence: 0.35,
      optimized: false
    };
  }

  return {
    bankName: best.importer.bankName,
    parserUsed: best.importer.parserName,
    importerId: best.importer.id,
    confidence: Number(best.confidence.toFixed(2)),
    optimized: best.importer.optimized
  };
}

export function getImporter(importerId) {
  return importersById[importerId] || genericImporter;
}
