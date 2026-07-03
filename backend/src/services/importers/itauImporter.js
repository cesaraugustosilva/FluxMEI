import { BaseImporter } from './baseImporter.js';

export const itauImporter = new BaseImporter({
  id: 'itau',
  bankName: 'Itau',
  parserName: 'Itau Importer',
  aliases: {
    data: ['data', 'data lancamento'],
    descricao: ['lancamento', 'descricao', 'historico'],
    valor: ['valor', 'amount'],
    tipo: ['tipo', 'entrada saida'],
    categoria: ['categoria'],
    external_id: ['id', 'documento']
  }
});
