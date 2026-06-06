# Deploy FluxMEI

Este guia prepara o FluxMEI para:

- Frontend na Vercel
- Backend no Render
- Banco e Auth no Supabase
- Pagamentos no Mercado Pago
- Dominio proprio

## Estrutura

- Frontend estatico: `frontend`
- Entrada principal: `frontend/index.html`, que redireciona para `frontend/landing-page/index.html`
- Landing page: `frontend/landing-page`
- Aplicativo autenticado: `frontend/app`
- Backend Express: `backend`
- Entrada do backend: `backend/src/server.js`
- Script de producao do backend: `npm start`
- API publica: sempre com prefixo `/api`

## Render

Crie um Web Service apontando para este repositorio.

Configuracoes:

- Root Directory: `backend`
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

Variaveis de ambiente no Render:

```env
NODE_ENV=production
FRONTEND_URL=https://seudominio.com,https://www.seudominio.com
APP_PUBLIC_URL=https://api.seudominio.com
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_do_supabase
GEMINI_API_KEY=sua_chave_gemini
JWT_SECRET=opcional_para_integracoes_futuras
AUTH_AUTO_CONFIRM_EMAIL=false
ALLOW_SELF_MANAGED_SUBSCRIPTIONS=false
MERCADO_PAGO_PUBLIC_KEY=sua_public_key_mercado_pago
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token_mercado_pago
MERCADO_PAGO_BASE_URL=https://api.mercadopago.com
MERCADO_PAGO_USE_SANDBOX=false
MERCADO_PAGO_WEBHOOK_SECRET=seu_secret_do_webhook
MERCADO_PAGO_NOTIFICATION_URL=https://api.seudominio.com/api/webhooks/mercado-pago
```

Observacoes:

- O Render define `PORT` automaticamente. Nao e necessario cadastrar `PORT`.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` ou `GEMINI_API_KEY` na Vercel.
- Em producao, `/api/dev/*` nao e registrado.
- Em producao, rotas duplicadas sem `/api` nao sao registradas.

## Vercel

Crie um projeto Vercel apontando para este repositorio.

Configuracoes:

- Root Directory: `frontend`
- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `.`
- Install Command: vazio ou padrao da Vercel

Variaveis de ambiente na Vercel:

```env
FLUXMEI_API_URL=https://api.seudominio.com/api
```

O build gera `frontend/env.js` com:

```js
window.FLUXMEI_CONFIG = {
  API_URL: "https://api.seudominio.com/api"
};
```

## Supabase

Banco novo:

1. Abra o SQL Editor.
2. Execute `backend/database/schema.sql`.

Banco existente:

1. Revise `backend/database/migrate_trial_mercado_pago.sql`.
2. Execute somente se as colunas de trial e Mercado Pago ainda nao existirem.

Tabelas esperadas:

- `profiles`
- `movimentacoes`
- `clientes`
- `das`
- `relatorios_ia`
- `assinaturas`

Auth:

- Site URL: `https://seudominio.com`
- Redirect URLs:

```text
https://seudominio.com/auth/login/index.html
https://seudominio.com/auth/recovery/nova-senha.html
https://www.seudominio.com/auth/login/index.html
https://www.seudominio.com/auth/recovery/nova-senha.html
```

RLS:

- O schema habilita RLS nas tabelas do app.
- As policies restringem leitura e escrita ao `auth.uid()` do usuario.
- O backend usa `SUPABASE_SERVICE_ROLE_KEY`; mantenha essa chave somente no Render.

## Mercado Pago

No painel do Mercado Pago:

1. Use credenciais de producao.
2. Configure o webhook de pagamentos:

```text
https://api.seudominio.com/api/webhooks/mercado-pago
```

3. Configure o segredo do webhook no Render:

```env
MERCADO_PAGO_WEBHOOK_SECRET=seu_secret_do_webhook
```

Fluxo esperado:

1. Usuario acessa `https://seudominio.com/app/payment/index.html`.
2. Frontend chama `https://api.seudominio.com/api/pagamentos/mercado-pago/criar-checkout`.
3. Backend cria a preferencia no Mercado Pago.
4. Usuario paga no Checkout Pro.
5. Mercado Pago chama o webhook.
6. Backend consulta o pagamento e, se `approved`, atualiza assinatura para `ativo` e `bloqueado = false`.

URLs de retorno sao geradas com `FRONTEND_URL`.

## DNS

Configure no provedor do dominio:

- `seudominio.com` e `www.seudominio.com` apontando para a Vercel.
- `api.seudominio.com` apontando para o Render.

Depois atualize:

- `FRONTEND_URL` no Render
- `APP_PUBLIC_URL` no Render
- `MERCADO_PAGO_NOTIFICATION_URL` no Render
- `FLUXMEI_API_URL` na Vercel
- URLs permitidas no Supabase Auth

## Checklist De Producao

1. Deploy backend no Render.
2. Confirmar `GET https://api.seudominio.com/api/health`.
3. Deploy frontend na Vercel.
4. Confirmar que `https://seudominio.com/env.js` contem a API correta.
5. Configurar Supabase Auth com URLs do dominio.
6. Executar SQL necessario no Supabase.
7. Configurar webhook no Mercado Pago.
8. Criar usuario real.
9. Fazer login.
10. Criar pagamento.
11. Pagar via Checkout Pro.
12. Confirmar assinatura `ativo` no Supabase.
13. Confirmar acesso desbloqueado no app.
