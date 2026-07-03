import { BaseImporter } from './baseImporter.js';

export const genericImporter = new BaseImporter({
  id: 'generic',
  bankName: 'Banco nao identificado',
  parserName: 'Parser Generico',
  optimized: false,
  aliases: {
    data: ['data', 'date', 'dtposted', 'data lancamento'],
    descricao: ['descricao', 'description', 'historico', 'memo', 'name', 'descricao lancamento'],
    valor: ['valor', 'value', 'amount', 'trnamt'],
    tipo: ['tipo', 'type'],
    categoria: ['categoria', 'category'],
    external_id: ['external_id', 'fitid', 'id transacao', 'identificador']
  }
});
