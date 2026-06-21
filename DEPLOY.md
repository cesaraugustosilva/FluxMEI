# Deploy FluxMEI

Este guia prepara o FluxMEI para:

- Frontend na Vercel
- Backend no Render
- Banco e Auth no Supabase
- Pagamentos na Efí Bank: Pix, cartao por token seguro e boleto
- Dominio proprio

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
EFI_CLIENT_ID=seu_client_id_efi
EFI_CLIENT_SECRET=seu_client_secret_efi
EFI_ENVIRONMENT=sandbox
EFI_SANDBOX=true
EFI_PIX_KEY=sua_chave_pix_efi
EFI_CERT_PATH=./certs/efi.p12
EFI_CERT_BASE64=
EFI_CERT_PASSPHRASE=
EFI_WEBHOOK_SECRET=seu_token_webhook_efi
EFI_WEBHOOK_URL=https://api.seudominio.com/api/webhooks/efi
```

Observacoes:

- O Render define `PORT` automaticamente.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `EFI_CLIENT_SECRET`, certificado Efí ou `GEMINI_API_KEY` na Vercel.
- Em producao, `EFI_WEBHOOK_SECRET` e obrigatorio.
- Em producao, `/api/dev/*` nao e registrado.

## Vercel

Configuracoes:

- Root Directory: `frontend`
- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `.`

Variavel de ambiente:

```env
FLUXMEI_API_URL=https://api.seudominio.com/api
```

## Supabase

Banco novo:

1. Abra o SQL Editor.
2. Execute `backend/database/schema.sql`.

Banco existente:

1. Execute `backend/database/migrate_trial_fluxmei.sql`.
2. Execute `backend/database/migrate_payment_provider_fields.sql`.
3. Execute `backend/database/migrate_fix_assinaturas_rls.sql`.
4. Execute `backend/database/migrate_payment_attempt_locks.sql`.

Tabelas esperadas:

- `profiles`
- `movimentacoes`
- `clientes`
- `das`
- `relatorios_ia`
- `assinaturas`
- `payment_attempt_locks`

Auth:

- Site URL: `https://seudominio.com`
- Redirect URLs:

```text
https://seudominio.com/auth/login/index.html
https://seudominio.com/auth/recovery/nova-senha.html
https://www.seudominio.com/auth/login/index.html
https://www.seudominio.com/auth/recovery/nova-senha.html
```

## Efí Bank

No painel da Efí Bank:

1. Crie a aplicacao e obtenha `EFI_CLIENT_ID` e `EFI_CLIENT_SECRET`.
2. Baixe o certificado `.p12`.
3. No Render, prefira `EFI_CERT_BASE64`; localmente, use `EFI_CERT_PATH`.
4. Configure `EFI_ENVIRONMENT=sandbox` para homologacao e `EFI_ENVIRONMENT=production` para producao.
5. Configure a chave Pix em `EFI_PIX_KEY`.
6. Configure o webhook para:

```text
https://api.seudominio.com/api/webhooks/efi
```

7. Configure o mesmo segredo/token no Render em `EFI_WEBHOOK_SECRET`.

O backend aceita o segredo via:

- `Authorization: Bearer <EFI_WEBHOOK_SECRET>`
- `x-efi-webhook-secret`
- `efi-webhook-secret`
- `x-webhook-secret`

A assinatura so e ativada quando o backend consulta a Efí e recebe status aprovado/concluido com plano e valor corretos.

## Teste Local PowerShell

O backend local usa a porta `3002`.

```powershell
$token = "COLE_O_TOKEN_DO_USUARIO_LOGADO"

$body = @{
  plano = "pro_mensal"
  valor = 49.90
  nome = "Cliente Teste"
  email = "teste@fluxmei.com.br"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3002/api/pagamentos/efi/pix" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

## Checklist De Producao

1. Deploy backend no Render.
2. Confirmar `GET https://api.seudominio.com/api/health`.
3. Deploy frontend na Vercel.
4. Confirmar que `https://seudominio.com/env.js` contem a API correta.
5. Configurar Supabase Auth com URLs do dominio.
6. Executar SQL necessario no Supabase.
7. Configurar webhook na Efí Bank.
8. Criar usuario real.
9. Fazer login.
10. Abrir `/checkout/`.
11. Gerar Pix, boleto ou pagar cartao com token seguro Efí.
12. Confirmar assinatura `ativo` no Supabase.
13. Confirmar acesso desbloqueado no app.
