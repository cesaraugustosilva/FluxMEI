import { BaseImporter } from './baseImporter.js';

export const mercadoPagoImporter = new BaseImporter({
  id: 'mercado_pago',
  bankName: 'Mercado Pago',
  parserName: 'Mercado Pago Importer',
  aliases: {
    data: ['data de liberacao', 'data', 'date', 'data da operacao'],
    descricao: ['descricao', 'description', 'operacao', 'titulo'],
    valor: ['valor liquido', 'valor', 'amount', 'total'],
    tipo: ['tipo de operacao', 'tipo'],
    categoria: ['categoria'],
    external_id: ['numero de operacao', 'id da operacao', 'id transacao']
  }
});
