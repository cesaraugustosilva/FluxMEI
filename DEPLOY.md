# Deploy FluxMEI

Este guia prepara o FluxMEI para:

- Frontend na Vercel
- Backend no Render
- Banco e Auth no Supabase
- Pagamentos no Asaas: Pix, boleto e cartao hospedado
- Efí Bank mantida como fallback tecnico
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
SUPABASE_JWT_SECRET=
GEMINI_API_KEY=sua_chave_gemini
GEMINI_MODEL=gemini-2.5-flash
AI_PROVIDER=gemini
JWT_SECRET=opcional_para_integracoes_futuras
AUTH_AUTO_CONFIRM_EMAIL=false
ALLOW_SELF_MANAGED_SUBSCRIPTIONS=false
ADMIN_EMAILS=admin@seudominio.com
PAYMENT_GATEWAY=asaas
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
ASAAS_WEBHOOK_URL=https://fluxmei.onrender.com/api/webhooks/asaas
EMAIL_PROVIDER=resend
RESEND_API_KEY=sua_chave_resend
EMAIL_FROM=FluxMEI <no-reply@seudominio.com>
EFI_CLIENT_ID=seu_client_id_efi
EFI_CLIENT_SECRET=seu_client_secret_efi
EFI_ENVIRONMENT=sandbox
EFI_SANDBOX=true
EFI_PIX_KEY=sua_chave_pix_efi
EFI_CERT_PATH=./certs/efi.p12
EFI_CERT_BASE64=
EFI_CERT_PASSPHRASE=
EFI_WEBHOOK_SECRET=seu_token_webhook_efi
EFI_WEBHOOK_URL=https://fluxmei.onrender.com/api/webhooks/efi
```

Observacoes:

- O Render define `PORT` automaticamente.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `EFI_CLIENT_SECRET`, certificado Efí ou `GEMINI_API_KEY` na Vercel.
- O checkout envia token do Supabase Auth. O backend valida esse token com `supabaseAdmin.auth.getUser(token)`, usando `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do mesmo projeto Supabase.
- `SUPABASE_JWT_SECRET` e opcional e nao e usado pelo middleware atual. Configure apenas se uma validacao local de JWT Supabase for implementada no futuro.
- `JWT_SECRET` e reservado para tokens proprios do FluxMEI, se existirem no futuro. Nao use `JWT_SECRET` para validar Supabase Auth JWT.
- Em producao, `ASAAS_WEBHOOK_TOKEN` e obrigatorio para validar eventos do Asaas.
- Configure `RESEND_API_KEY` somente no Render/backend para e-mails automaticos. Nao coloque essa chave na Vercel.
- Configure `ADMIN_EMAILS` somente no Render/backend ou marque `profiles.is_admin=true` no Supabase para liberar `/admin/`.
- Se usar Efí como fallback, `EFI_WEBHOOK_SECRET` tambem deve ser configurado.
- Em producao, `/api/dev/*` nao e registrado.

## Vercel

Configuracoes:

- Root Directory: `frontend`
- Framework Preset: Other
- Build Command: `npm run build`
- Output Directory: `.`

Variaveis obrigatorias na Vercel:

```env
FLUXMEI_API_URL=https://api.seudominio.com/api
FLUXMEI_PAYMENT_GATEWAY=asaas
```

`FLUXMEI_API_URL` e obrigatoria em producao/Vercel. Com Root Directory `frontend`, o comando `npm run build` executa `node scripts/write-env.js` e gera `/env.js`. Se a Vercel for configurada com a raiz do repositorio, use `npm run build`, que executa `node frontend/scripts/write-env.js`.

Depois do deploy, confirme no navegador:

```text
https://www.fluxmei.com.br/env.js
```

O arquivo deve conter `window.FLUXMEI_CONFIG` com `API_URL` apontando para a API correta e apenas variaveis publicas: `API_URL`, `PAYMENT_GATEWAY`, `EFI_PAYEE_CODE` e `EFI_ENVIRONMENT`.

`FLUXMEI_PAYMENT_GATEWAY=asaas` faz o checkout chamar as rotas Asaas de Pix, boleto e cartao. Nunca coloque `ASAAS_API_KEY`, `EFI_CLIENT_SECRET`, certificado ou chave Pix na Vercel.

## Supabase

Banco novo:

1. Abra o SQL Editor.
2. Execute `backend/database/schema.sql`.

Banco existente:

1. Execute `backend/database/migrate_trial_fluxmei.sql`.
2. Execute `backend/database/migrate_payment_provider_fields.sql`.
3. Execute `backend/database/migrate_fix_assinaturas_rls.sql`.
4. Execute `backend/database/migrate_payment_attempt_locks.sql`.
5. Execute `backend/database/migrate_subscription_management.sql`.
6. Execute `backend/database/migrate_admin_panel.sql`.
7. Execute `backend/database/migrate_audit_logs.sql`.
8. Execute `backend/database/migrate_coupons.sql`.

Tabelas esperadas:

- `profiles`
- `movimentacoes`
- `clientes`
- `das`
- `relatorios_ia`
- `assinaturas`
- `payment_attempt_locks`
- `notification_events`
- `audit_logs`
- `coupons`

Auth:

- Site URL: `https://seudominio.com`
- Redirect URLs:

```text
https://seudominio.com/auth/login/index.html
https://seudominio.com/auth/recovery/nova-senha.html
https://www.seudominio.com/auth/login/index.html
https://www.seudominio.com/auth/recovery/nova-senha.html
```

## Asaas

No painel do Asaas:

1. Gere uma chave de API e configure no Render como `ASAAS_API_KEY`.
2. Use `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3` para sandbox.
3. Use `ASAAS_BASE_URL=https://api.asaas.com/v3` para producao.
4. Configure `PAYMENT_GATEWAY=asaas`.
5. Crie um token secreto para webhook e configure em `ASAAS_WEBHOOK_TOKEN`.
6. Cadastre o webhook para:

```text
https://fluxmei.onrender.com/api/webhooks/asaas
```

Eventos minimos:

- `PAYMENT_RECEIVED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_RECEIVED_IN_CASH`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `PAYMENT_REFUNDED`
- `PAYMENT_CHARGEBACK_REQUESTED`

O Asaas deve enviar o token no header `asaas-access-token`, com o mesmo valor de `ASAAS_WEBHOOK_TOKEN`. A assinatura so e ativada depois que o backend consulta `GET /v3/payments/{id}` e confirma status `RECEIVED`, `CONFIRMED` ou `RECEIVED_IN_CASH`. Para cartao, se a criacao da cobranca ja retornar status aprovado/confirmado, o backend ativa a assinatura imediatamente; se retornar pendente, aguarda webhook.

Cartao Asaas:

- Rota autenticada: `POST /api/pagamentos/asaas/criar-cartao`.
- O frontend envia apenas plano, cupom e CPF/CNPJ do cliente. Numero do cartao, validade e CVV nao passam pelo backend FluxMEI.
- O backend cria uma cobranca Asaas com `billingType=CREDIT_CARD` sem objeto `creditCard`/`creditCardHolderInfo` e retorna `invoiceUrl` para o usuario concluir no ambiente seguro do Asaas.
- `provider_raw` deve conter apenas dados sanitizados de conciliacao.
- A rota rejeita payloads com `card_number`, `number`, `cvv`, `ccv`, `expirationMonth`, `expirationYear`, `expiry` ou `raw_card`.
- A API de tokenizacao Asaas pode ser avaliada futuramente se houver tokenizacao client-side aprovada para a conta. Ate la, o checkout hospedado reduz o escopo PCI sem quebrar webhook, historico, recibos e assinaturas.

Teste de cartao em sandbox:

1. Use `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`.
2. Gere `ASAAS_API_KEY` no sandbox e configure `PAYMENT_GATEWAY=asaas`.
3. Abra `/checkout/`, escolha Cartao e clique em `Pagar com cartao no ambiente seguro Asaas`.
4. Conclua o pagamento na URL hospedada pelo Asaas.
5. Confira no Supabase que `provider_raw` nao contem numero do cartao, CVV ou validade.
6. Para pendencias, confirme pelo painel sandbox/webhook e valide que duplicidade nao estende vencimento duas vezes.

Teste de cartao em producao:

1. Use `ASAAS_BASE_URL=https://api.asaas.com/v3`.
2. Garanta HTTPS ponta a ponta no dominio do checkout e backend.
3. Execute primeiro uma compra real de baixo valor controlada.
4. Confirme webhook `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED`, ativacao da assinatura e ausencia de dados sensiveis em logs/Supabase.
5. Se a tokenizacao Asaas client-side for habilitada para a conta, planeje uma migracao separada para receber apenas token seguro no backend.

Para validar no Supabase, confira em `assinaturas`:

- `status = ativo`
- `bloqueado = false`
- `payment_provider = asaas`
- `provider_payment_id` preenchido
- `paid_at` preenchido
- `data_vencimento` atualizado

## Efí Bank

A Efí fica como fallback tecnico. Mantenha as variaveis somente se for usar ou testar esse fallback.

No painel da Efí Bank:

1. Crie a aplicacao e obtenha `EFI_CLIENT_ID` e `EFI_CLIENT_SECRET`.
2. Baixe o certificado `.p12`.
3. No Render, prefira `EFI_CERT_BASE64`; localmente, use `EFI_CERT_PATH`.
4. Configure `EFI_ENVIRONMENT=sandbox` para homologacao e `EFI_ENVIRONMENT=production` para producao.
5. Configure a chave Pix em `EFI_PIX_KEY`.
6. Cadastre o webhook Pix pela API da EFI (`PUT /v2/webhook/:chave`, usando `EFI_PIX_KEY`) para:

```text
https://api.seudominio.com/api/webhooks/efi?secret=<EFI_WEBHOOK_SECRET>&ignorar=
```

Para o Render atual do FluxMEI, use:

```text
https://fluxmei.onrender.com/api/webhooks/efi?secret=<EFI_WEBHOOK_SECRET>&ignorar=
```

Em desenvolvimento, com usuario autenticado, o backend expoe rotas protegidas para executar e conferir o cadastro:

```http
POST /api/dev/efi/register-webhook
GET  /api/dev/efi/webhook
```

Essas rotas nao sao registradas quando `NODE_ENV=production`. Em producao, use uma ferramenta administrativa segura ou script temporario no backend para executar o mesmo cadastro, sem expor `EFI_WEBHOOK_SECRET`, certificado ou chave Pix.

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
  -Uri "http://localhost:3002/api/pagamentos/asaas/criar-pix" `
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
7. Configurar webhook no Asaas.
8. Criar usuario real.
9. Fazer login.
10. Abrir `/checkout/`.
11. Gerar Pix ou boleto Asaas no checkout.
12. Confirmar assinatura `ativo` no Supabase.
13. Confirmar acesso desbloqueado no app.
