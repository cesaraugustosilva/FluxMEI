# Deploy FluxMEI

Este guia define o padrao oficial de build e deploy do FluxMEI.

## Estrutura do projeto

```text
/
backend/   API Node.js/Express, Supabase, Asaas, Efi, FluxIA e rotas admin
frontend/  HTML/CSS/JS estatico, build de env.js e assets publicos
tests/     testes automatizados com node:test
scripts/   scripts de orquestracao e deploy-check
```

A raiz e apenas um orquestrador npm. As dependencias de runtime do backend ficam em `backend/package.json`. O frontend nao possui dependencias obrigatorias de runtime.

## Como rodar localmente

```bash
npm install
copy backend\.env.example backend\.env
npm run dev
```

Servicos locais:

```text
Backend:  http://localhost:3002
Frontend: http://localhost:5173
Health:   http://localhost:3002/api/health
```

Tambem e possivel rodar separadamente:

```bash
npm run dev:backend
npm run dev:frontend
```

## Como rodar testes

```bash
npm test
```

Alias equivalente:

```bash
npm run test:backend
```

## Como fazer build

O build do frontend gera `frontend/env.js` a partir das variaveis publicas.

```bash
npm run build
```

O arquivo `frontend/env.js` deve continuar ignorado pelo git.

## Deploy Render

Use um Web Service apontando para o repositorio.

Configuracao:

```text
Root Directory: backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Variaveis obrigatorias no Render:

```env
NODE_ENV=production
FRONTEND_URL=https://www.fluxmei.com.br
APP_PUBLIC_URL=https://api.fluxmei.com.br
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anon
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role
SUPABASE_JWT_SECRET=seu_jwt_secret
PAYMENT_GATEWAY=asaas
ASAAS_API_KEY=sua_chave_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook
ASAAS_WEBHOOK_URL=https://api.fluxmei.com.br/api/webhooks/asaas
GEMINI_API_KEY=sua_chave_gemini
GEMINI_MODEL=gemini-2.5-flash
AI_PROVIDER=gemini
ADMIN_EMAILS=admin@fluxmei.com.br
EMAIL_PROVIDER=resend
RESEND_API_KEY=sua_chave_resend
EMAIL_FROM=FluxMEI <no-reply@fluxmei.com.br>
```

Variaveis Efi devem ficar no Render apenas se o fallback tecnico estiver ativo:

```env
EFI_CLIENT_ID=
EFI_CLIENT_SECRET=
EFI_ENVIRONMENT=sandbox
EFI_SANDBOX=true
EFI_PIX_KEY=
EFI_CERT_PATH=./certs/efi.p12
```

## Deploy Vercel

Use um projeto separado para o frontend.

Configuracao:

```text
Root Directory: frontend
Build Command: npm run build
Output Directory: .
```

Variaveis obrigatorias na Vercel:

```env
FLUXMEI_API_URL=https://api.fluxmei.com.br
FLUXMEI_PAYMENT_GATEWAY=asaas
```

Variaveis publicas opcionais:

```env
EFI_PAYEE_CODE=
EFI_ENVIRONMENT=sandbox
```

Depois do deploy, confira no navegador:

```text
https://www.fluxmei.com.br/env.js
```

O arquivo deve conter apenas variaveis publicas como `API_URL`, `PAYMENT_GATEWAY`, `EFI_PAYEE_CODE` e `EFI_ENVIRONMENT`. Nunca deve conter secrets como `ASAAS_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` ou `GEMINI_API_KEY`.

## Variaveis obrigatorias

Backend:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
PAYMENT_GATEWAY
ASAAS_API_KEY
ASAAS_WEBHOOK_TOKEN
GEMINI_API_KEY
```

Frontend:

```text
FLUXMEI_API_URL
FLUXMEI_PAYMENT_GATEWAY
```

## Deploy check

Antes de publicar:

```bash
npm run deploy-check
```

O script verifica scripts npm, instalacao local, entradas Render/Vercel, schema Supabase e variaveis obrigatorias. Ele nao modifica arquivos. Em ambiente local sem envs de producao, falhas de variaveis sao esperadas.

Para checar apenas variaveis:

```bash
npm run check-env
```

## Checklist antes do deploy

- `npm install` executado na raiz.
- `npm test` passando.
- `npm run build` gerando `frontend/env.js`.
- `npm run deploy-check` sem falhas no ambiente de deploy.
- Render apontando para `backend`.
- Vercel apontando para `frontend`.
- `/api/health` respondendo no backend.
- `/env.js` publicado no dominio do frontend com `API_URL` correto.
- Webhook Asaas configurado para `/api/webhooks/asaas`.
- Migrations e `backend/database/schema.sql` aplicados no Supabase.
- Secrets presentes apenas no Render ou Supabase, nunca no frontend.
