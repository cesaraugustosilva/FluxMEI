# Modulos do frontend FluxMEI

Esta pasta prepara a separacao gradual do `app.js` sem alterar o comportamento
atual do app.

Nesta fase, os submodulos documentam limites de responsabilidade. O `app.js`
continua sendo o ponto de execucao principal. Extracoes futuras devem ser
pequenas, cobertas por testes e sem alterar IDs, classes ou handlers publicos.
