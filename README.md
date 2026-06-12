# FluxMEI

SaaS de gestao financeira para MEIs.

O FluxMEI ajuda microempreendedores a controlar receitas, despesas, clientes, DAS, metas financeiras e assinatura em uma plataforma web simples, com teste gratis de 7 dias e checkout integrado.

## Principais Recursos

- Controle de receitas e despesas
- Dashboard financeiro
- Clientes
- DAS
- Metas financeiras
- Teste gratis de 7 dias
- Assinatura
- Checkout com Asaas e Mercado Pago fallback

## Stack

- Frontend HTML/CSS/JS
- Backend Node.js/Express
- Supabase
- Asaas
- Mercado Pago fallback
- Vercel
- Render

## Estrutura De Pastas

```text
FluxMEI/
  backend/
    database/        SQL de schema e migrations
    src/             API Express, rotas, controllers, services e middlewares
  frontend/
    app/             Painel autenticado
    auth/            Login, cadastro e recuperacao de senha
    checkout/        Checkout de assinatura
    landing-page/    Landing page
    assets/          Logos e icones
  docs/              Roteiros e documentacao de validacao
  DEPLOY.md          Guia de deploy Vercel/Render/Supabase
```

## Como Rodar Localmente

Instale as dependencias na raiz do projeto:

```bash
npm install
```

Crie e configure o arquivo de ambiente do backend:

```bash
copy backend\.env.example backend\.env
```

Depois rode:

```bash
npm start
```

Acesse:

```text
http://localhost:3002
```

Health check da API:

```text
http://localhost:3002/api/health
```

## Testes Automatizados

O projeto usa o runner nativo do Node.js (`node:test`) para testes criticos de trial, assinatura, webhook e controle de acesso.

Para rodar:

```bash
npm test
```

Os testes nao usam banco de producao e nao chamam APIs reais de Asaas ou Mercado Pago.

## Variaveis De Ambiente Principais

As principais variaveis ficam em `backend/.env`:

```env
NODE_ENV=production
FRONTEND_URL=https://seudominio.com,https://www.seudominio.com
APP_PUBLIC_URL=https://api.seudominio.com

SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

GEMINI_API_KEY=sua_chave_gemini

MERCADO_PAGO_PUBLIC_KEY=sua_public_key
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token
MERCADO_PAGO_WEBHOOK_SECRET=seu_secret_do_webhook
MERCADO_PAGO_NOTIFICATION_URL=https://api.seudominio.com/api/webhooks/mercado-pago

ASAAS_API_KEY=sua_api_key
ASAAS_WEBHOOK_TOKEN=seu_token_webhook
ASAAS_BASE_URL=https://api.asaas.com/v3
```

No frontend, o build usa:

```env
FLUXMEI_API_URL=https://api.seudominio.com/api
```

## Deploy

Deploy recomendado:

- Frontend na Vercel, com root directory `frontend`
- Backend no Render, com root directory `backend`
- Banco e Auth no Supabase
- Webhooks configurados nos paineis do Asaas e Mercado Pago

Consulte o passo a passo completo em `DEPLOY.md`.

## Observacoes De Seguranca

- Nunca commitar `.env`, `.env.*` ou chaves reais.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no backend.
- Chaves privadas de Asaas, Mercado Pago e Gemini nunca devem ir para a Vercel.
- Webhooks de pagamento precisam de token/secret configurados.
- Em producao, webhooks sem `ASAAS_WEBHOOK_TOKEN` ou `MERCADO_PAGO_WEBHOOK_SECRET` devem ser recusados.

## Status Do Projeto

MVP em desenvolvimento.
