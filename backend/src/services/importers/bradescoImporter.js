import { BaseImporter } from './baseImporter.js';

export const bradescoImporter = new BaseImporter({
  id: 'bradesco',
  bankName: 'Bradesco',
  parserName: 'Bradesco Importer',
  aliases: {
    data: ['data', 'data lancamento'],
    descricao: ['historico', 'descricao', 'lancamento'],
    valor: ['valor', 'valor lancamento'],
    tipo: ['tipo', 'debito credito'],
    categoria: ['categoria'],
    external_id: ['documento', 'numero documento']
  }
});
