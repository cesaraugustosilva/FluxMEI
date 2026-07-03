# Modulos do backend FluxMEI

Esta pasta organiza pontos de entrada por dominio sem substituir os caminhos atuais.

Nesta fase conservadora, cada modulo expoe barrels (`index.js`) que apontam para
controllers, routes e services existentes. Nenhuma regra de negocio foi movida.

Novos arquivos devem preferir nascer dentro do modulo correspondente quando isso
nao exigir alteracao de contrato publico.
