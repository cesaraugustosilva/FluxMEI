import { BaseImporter } from './baseImporter.js';

export const santanderImporter = new BaseImporter({
  id: 'santander',
  bankName: 'Santander',
  parserName: 'Santander Importer',
  aliases: {
    data: ['data', 'data lancamento'],
    descricao: ['descricao', 'historico', 'lancamento'],
    valor: ['valor', 'valor r'],
    tipo: ['tipo', 'debito credito'],
    categoria: ['categoria'],
    external_id: ['documento', 'id transacao']
  }
});
