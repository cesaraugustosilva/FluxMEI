import { BaseImporter } from './baseImporter.js';

export const c6Importer = new BaseImporter({
  id: 'c6',
  bankName: 'C6 Bank',
  parserName: 'C6 Importer',
  aliases: {
    data: ['data', 'data lancamento'],
    descricao: ['descricao', 'historico', 'lancamento'],
    valor: ['valor', 'amount'],
    tipo: ['tipo', 'natureza'],
    categoria: ['categoria'],
    external_id: ['id', 'identificador']
  }
});
