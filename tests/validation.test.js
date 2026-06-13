import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeText,
  validateDate,
  validateEmail,
  validateMoney,
  validateMonthReference
} from '../backend/src/utils/validation.js';

test('rejeita script em nome de cliente', () => {
  assert.throws(
    () => sanitizeText('<script>alert(1)</script> Cliente', {
      field: 'Nome',
      required: true,
      rejectDangerous: true
    }),
    /conteúdo inválido/
  );
});

test('rejeita valor negativo em receita ou despesa', () => {
  assert.throws(() => validateMoney(-10), /Informe um valor válido/);
});

test('rejeita e-mail inválido', () => {
  assert.throws(() => validateEmail('email-invalido'), /Preencha um e-mail válido/);
});

test('rejeita mês de referência inválido', () => {
  assert.throws(() => validateMonthReference('2026-13'), /Mês de referência inválido/);
});

test('sanitiza observação com HTML', () => {
  const value = sanitizeText('  <b>Pago</b>   <i>com atraso</i>  ', {
    field: 'Observação',
    max: 1000
  });

  assert.equal(value, 'Pago com atraso');
});

test('mantém campos válidos após normalização', () => {
  assert.equal(sanitizeText('  Ana   Silva  ', { field: 'Nome', required: true }), 'Ana Silva');
  assert.equal(validateEmail(' ANA@EXEMPLO.COM '), 'ana@exemplo.com');
  assert.equal(validateDate('2026-06-12'), '2026-06-12');
  assert.equal(validateMoney('49,90'), 49.9);
  assert.equal(validateMonthReference('2026-06'), '2026-06');
});
