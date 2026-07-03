import { BaseImporter } from './baseImporter.js';

export const interImporter = new BaseImporter({
  id: 'inter',
  bankName: 'Banco Inter',
  parserName: 'Inter Importer',
  aliases: {
    data: ['data lancamento', 'data', 'date'],
    descricao: ['historico', 'descricao', 'detalhes', 'complemento'],
    valor: ['valor', 'valor lancamento', 'amount'],
    tipo: ['tipo operacao', 'tipo'],
    categoria: ['categoria'],
    external_id: ['id transacao', 'nsu', 'identificador']
  }
});
