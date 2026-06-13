import { AppError } from '../middlewares/errorMiddleware.js';

const TAG_PATTERN = /<[^>]*>/g;
const DANGEROUS_PATTERN = /<\s*script\b|javascript:|on\w+\s*=/i;

export function rejectUnexpectedFields(body = {}, allowed = []) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(body || {}).filter((key) => !allowedSet.has(key));
  if (unexpected.length) {
    throw new AppError(`Campos inesperados: ${unexpected.join(', ')}.`);
  }
}

export function sanitizeText(value, {
  field = 'Texto',
  required = false,
  max = 255,
  rejectDangerous = false,
  allowEmpty = false
} = {}) {
  if (value === undefined || value === null) {
    if (required) throw new AppError(`${field} é obrigatório.`);
    return allowEmpty ? '' : null;
  }

  if (typeof value !== 'string') throw new AppError(`${field} deve ser texto.`);
  const raw = value.trim();
  if (rejectDangerous && DANGEROUS_PATTERN.test(raw)) {
    throw new AppError(`${field} contém conteúdo inválido.`);
  }

  const sanitized = raw
    .replace(TAG_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (required && !sanitized) throw new AppError(`${field} é obrigatório.`);
  if (!allowEmpty && !sanitized) return null;
  if (sanitized.length > max) throw new AppError('Texto muito longo.');
  return sanitized;
}

export function validateEmail(value, { required = true, field = 'E-mail' } = {}) {
  const email = sanitizeText(value, { field, required, max: 254, rejectDangerous: true });
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    throw new AppError('Preencha um e-mail válido.');
  }
  return email.toLowerCase();
}

export function validateDate(value, { required = true, field = 'Data' } = {}) {
  const date = sanitizeText(value, { field, required, max: 10 });
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError('Data inválida.');

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError('Data inválida.');
  }
  return date;
}

export function validateMonthReference(value, { required = true, field = 'Mês de referência' } = {}) {
  const month = sanitizeText(value, { field, required, max: 7 });
  if (!month) return null;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new AppError('Mês de referência inválido.');
  }
  return month;
}

export function validateMoney(value, { required = true, field = 'Valor', allowZero = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new AppError(`${field} é obrigatório.`);
    return null;
  }

  const normalized = typeof value === 'string' ? value.replace(',', '.').trim() : value;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number <= 0)) {
    throw new AppError('Informe um valor válido.');
  }
  return number;
}

export function validateOneOf(value, allowed, { required = true, field = 'Campo' } = {}) {
  const text = sanitizeText(value, { field, required, max: 80 });
  if (!text) return null;
  if (!allowed.includes(text)) throw new AppError(`${field} inválido.`);
  return text;
}
