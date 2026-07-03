export function normalizeImportKey(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class BaseImporter {
  constructor({ id, bankName, parserName, aliases = {}, optimized = true }) {
    this.id = id;
    this.bankName = bankName;
    this.parserName = parserName;
    this.aliases = aliases;
    this.optimized = optimized;
  }

  pick(row, names) {
    for (const name of names || []) {
      const key = normalizeImportKey(name);
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== '') return row[key];
    }
    return null;
  }

  adaptRow(row) {
    const adapted = { ...row };
    const fields = ['data', 'descricao', 'valor', 'tipo', 'categoria', 'external_id'];

    for (const field of fields) {
      const value = this.pick(row, this.aliases[field]);
      if (value !== null && adapted[field] === undefined) adapted[field] = value;
    }

    return adapted;
  }
}
