import { BaseImporter } from './baseImporter.js';

export const bbImporter = new BaseImporter({
  id: 'bb',
  bankName: 'Banco do Brasil',
  parserName: 'Banco do Brasil Importer',
  aliases: {
    data: ['data', 'dt lancamento', 'data lancamento'],
    descricao: ['historico', 'descricao', 'documento'],
    valor: ['valor', 'valor lancamento'],
    tipo: ['tipo', 'debito credito'],
    categoria: ['categoria'],
    external_id: ['documento', 'numero documento']
  }
});
