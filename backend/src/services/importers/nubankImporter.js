import { BaseImporter } from './baseImporter.js';

export const nubankImporter = new BaseImporter({
  id: 'nubank',
  bankName: 'Nubank',
  parserName: 'Nubank Importer',
  aliases: {
    data: ['date', 'data'],
    descricao: ['title', 'description', 'descricao', 'detalhes'],
    valor: ['amount', 'valor'],
    categoria: ['category', 'categoria'],
    external_id: ['id', 'transaction id', 'identificador']
  }
});
