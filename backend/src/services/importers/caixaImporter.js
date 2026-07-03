import { BaseImporter } from './baseImporter.js';

export const caixaImporter = new BaseImporter({
  id: 'caixa',
  bankName: 'Caixa',
  parserName: 'Caixa Importer',
  aliases: {
    data: ['data mov', 'data movimento', 'data'],
    descricao: ['historico', 'descricao', 'lancamento'],
    valor: ['valor', 'valor r'],
    tipo: ['tipo', 'd c'],
    categoria: ['categoria'],
    external_id: ['documento', 'numero documento']
  }
});
