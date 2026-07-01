import assert from 'node:assert/strict';

function matchesFilter(row, [operator, column, value]) {
  if (operator === 'eq') return row?.[column] === value;
  if (operator === 'in') return Array.isArray(value) && value.includes(row?.[column]);
  if (operator === 'is') return row?.[column] === value;
  if (operator === 'not') {
    if (value === null || value === 'null') return row?.[column] !== null && row?.[column] !== undefined;
    return row?.[column] !== value;
  }
  return true;
}

function applyFilters(rows, filters) {
  return rows.filter((row) => filters.every((filter) => matchesFilter(row, filter)));
}

export function createSupabaseMock({ rowsByTable = {}, strictTables = null } = {}) {
  const rows = new Map(Object.entries(rowsByTable).map(([table, value]) => [table, [...value]]));
  const stats = {
    tables: [],
    selects: [],
    inserts: [],
    updates: [],
    upserts: [],
    filters: []
  };

  function getRows(table) {
    if (!rows.has(table)) rows.set(table, []);
    return rows.get(table);
  }

  function from(table) {
    if (strictTables) assert.ok(strictTables.includes(table), `Unexpected Supabase table: ${table}`);
    stats.tables.push(table);

    const query = {
      table,
      payload: null,
      filters: [],
      limitValue: null,
      select(fields = '*') {
        stats.selects.push({ table, fields });
        return this;
      },
      insert(payload) {
        this.payload = payload;
        const row = {
          id: `${table}-${stats.inserts.length + 1}`,
          ...(Array.isArray(payload) ? payload[0] : payload)
        };
        getRows(table).push(row);
        stats.inserts.push({ table, payload: Array.isArray(payload) ? payload : { ...payload }, row });
        return this;
      },
      upsert(payload) {
        this.payload = payload;
        const row = {
          id: `${table}-${stats.upserts.length + 1}`,
          ...(Array.isArray(payload) ? payload[0] : payload)
        };
        getRows(table).push(row);
        stats.upserts.push({ table, payload: Array.isArray(payload) ? payload : { ...payload }, row });
        return this;
      },
      update(payload) {
        this.payload = payload;
        stats.updates.push({ table, payload: { ...payload }, filters: this.filters });
        return this;
      },
      eq(column, value) {
        this.filters.push(['eq', column, value]);
        stats.filters.push({ table, operator: 'eq', column, value });
        return this;
      },
      in(column, value) {
        this.filters.push(['in', column, value]);
        stats.filters.push({ table, operator: 'in', column, value });
        return this;
      },
      is(column, value) {
        this.filters.push(['is', column, value]);
        stats.filters.push({ table, operator: 'is', column, value });
        return this;
      },
      not(column, operator, value) {
        this.filters.push(['not', column, value ?? operator]);
        stats.filters.push({ table, operator: 'not', column, value: value ?? operator });
        return this;
      },
      gte() { return this; },
      lte() { return this; },
      neq() { return this; },
      order() { return this; },
      limit(value) {
        this.limitValue = value;
        return this;
      },
      async maybeSingle() {
        if (this.payload) return { data: { id: `${table}-single`, ...this.payload }, error: null };
        const data = applyFilters(getRows(table), this.filters)[0] || null;
        return { data, error: null };
      },
      async single() {
        if (this.payload) return { data: { id: `${table}-single`, ...this.payload }, error: null };
        const data = applyFilters(getRows(table), this.filters)[0] || null;
        return { data, error: null };
      },
      async then(resolve, reject) {
        try {
          let data = applyFilters(getRows(table), this.filters);
          if (this.limitValue != null) data = data.slice(0, this.limitValue);
          resolve({ data, error: null });
        } catch (error) {
          reject(error);
        }
      }
    };

    return query;
  }

  return { from, stats, rows };
}
