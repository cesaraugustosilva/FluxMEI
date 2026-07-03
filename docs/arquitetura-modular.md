# Arquitetura modular do FluxMEI

## Objetivo

O FluxMEI cresceu em dominios como pagamentos, assinaturas, FluxIA, importacoes,
conciliacao, notificacoes, admin, cupons, indicacoes, exportacao, backup e
onboarding. Esta primeira fase cria uma organizacao modular conservadora, sem
mudar comportamento, endpoints publicos, banco, migrations, checkout, FluxIA ou
pagamentos.

## Estrutura atual

O backend segue funcionando pelos caminhos atuais:

- `backend/src/controllers/`
- `backend/src/routes/`
- `backend/src/services/`
- `backend/src/middlewares/`

O frontend segue funcionando por:

- `frontend/app/index.html`
- `frontend/app/app.js`
- `frontend/app/style.css`

Esses arquivos continuam sendo a fonte de execucao atual.

## Nova estrutura proposta

### Backend

`backend/src/modules/` contem barrels por dominio:

- `auth/`
- `payments/`
- `subscriptions/`
- `ai/`
- `imports/`
- `notifications/`
- `admin/`
- `coupons/`
- `referrals/`
- `exports/`
- `audit/`

Nesta fase, os `index.js` apenas reexportam arquivos existentes. Isso permite
imports mais organizados em novos codigos sem mover regras criticas.

### Frontend

`frontend/app/modules/` documenta limites para futuras extracoes:

- `dashboard/`
- `movimentacoes/`
- `metas/`
- `fluxia/`
- `minha-conta/`
- `notificacoes/`
- `importacoes/`
- `assinatura/`
- `ui/`

O `app.js` permanece intacto como ponto principal. Novas extracoes devem ser
pequenas e reversiveis.

## Regras para novos arquivos

- Preferir criar codigo novo no modulo do dominio correspondente.
- Evitar controllers gigantes: regras devem ficar em services do dominio.
- Evitar services multiuso sem dono claro.
- Manter endpoints publicos registrados nos routes atuais ate uma fase de
  migracao planejada.
- Nao alterar nomes de tabelas, migrations ou contratos da API sem tarefa
  explicita.
- Preservar IDs/classes do frontend usados por testes e automacoes.

## Como evitar `app.js` gigante

1. Extrair primeiro helpers puros, sem acesso direto ao DOM.
2. Depois extrair renderizadores pequenos por area.
3. Manter os mesmos IDs do HTML e os mesmos handlers globais enquanto houver
   compatibilidade com telas existentes.
4. Cobrir cada extracao com teste de texto ou comportamento antes de remover do
   `app.js`.

## Como evitar controllers gigantes

1. Controller deve validar entrada simples e chamar service.
2. Regra de negocio deve ficar no service do modulo.
3. Integracoes externas devem ter adapters/services proprios.
4. Auditoria, notificacoes e logs devem ser chamados como efeitos laterais
   seguros, sem bloquear o fluxo principal quando possivel.

## Padrao de nomeacao

- Backend services: `dominioService.js`.
- Backend controllers: `dominioController.js`.
- Backend routes: `dominioRoutes.js`.
- Frontend modules: nomes em kebab-case ou nomes ja usados no app.
- Testes: `dominio.test.js` ou `dominio-ui.test.js`.

## Compatibilidade

Esta fase nao moveu logica critica. Os imports antigos continuam validos e os
barrels novos sao uma camada opcional para evolucao gradual.
