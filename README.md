# FluxMEI

SaaS de gestao financeira para MEIs.

O FluxMEI ajuda microempreendedores a controlar receitas, despesas, clientes, DAS, metas financeiras e assinatura em uma plataforma web simples, com teste gratis de 7 dias e checkout integrado.

O gateway de pagamento ativo e unico e a Efí Bank, com Pix, boleto e cartao por token seguro.

## Principais Recursos

- Controle de receitas e despesas
- Dashboard financeiro
- Clientes
- DAS
- Metas financeiras
- Teste gratis de 7 dias
- Assinatura
- Checkout com Pix, cartao e boleto via Efí Bank

## Stack

- Frontend HTML/CSS/JS
- Backend Node.js/Express
- Supabase
- Efí Bank
- Vercel
- Render

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

O projeto usa o runner nativo do Node.js (`node:test`) para testes criticos de trial, assinatura, webhook, checkout e controle de acesso.

Para rodar no Windows:

```bash
npm.cmd test
```

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

EFI_CLIENT_ID=seu_client_id_efi
EFI_CLIENT_SECRET=seu_client_secret_efi
EFI_ENVIRONMENT=sandbox
EFI_SANDBOX=true
EFI_PIX_KEY=sua_chave_pix_efi
EFI_CERT_PATH=./certs/efi.p12
EFI_CERT_BASE64=
EFI_WEBHOOK_SECRET=seu_token_webhook_efi
EFI_WEBHOOK_URL=https://api.seudominio.com/api/webhooks/efi
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
- Webhook configurado no painel da Efí Bank

Consulte o passo a passo completo em `DEPLOY.md`.
Para a configuracao operacional da Efí Bank, consulte `docs/efi-bank-integracao.md`.

## Observacoes De Seguranca

- Nunca commitar `.env`, `.env.*`, certificados ou chaves reais.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar apenas no backend.
- Chaves privadas da Efí Bank e Gemini nunca devem ir para a Vercel.
- Webhook de pagamento precisa de segredo configurado.
- O webhook Efí e a fonte oficial para ativar assinatura.
- Alem do rate limit global, rotas sensiveis possuem limites especificos por IP: login 10/15min, cadastro 5/30min, recuperacao/nova senha 3/30min e pagamentos 20/15min.

## Status Do Projeto

MVP em desenvolvimento.
