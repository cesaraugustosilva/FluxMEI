# FluxMEI Backend

Backend REST do FluxMEI usando Node.js, Express, Supabase PostgreSQL/Auth, Gemini API e Efí Bank.

## Requisitos

- Node.js 18+
- Projeto no Supabase
- Chave da Gemini API
- Credenciais Efí Bank

## Configuracao

Na raiz do projeto:

```bash
npm install
copy backend\.env.example backend\.env
```

Edite `backend/.env` com as variaveis do arquivo exemplo. Em local, a porta padrao e `3002`.

Importante: `SUPABASE_SERVICE_ROLE_KEY`, `EFI_CLIENT_SECRET` e certificados Efí ficam somente no backend.

## Banco De Dados

Banco novo:

1. Abra o Supabase.
2. Va em SQL Editor.
3. Cole e execute `database/schema.sql`.

Banco existente:

1. Execute `database/migrate_trial_fluxmei.sql` se o banco ainda nao tiver os campos de trial e pagamento generico.
2. Execute `database/migrate_payment_provider_fields.sql` se o banco ainda nao tiver `payment_provider`, `provider_payment_id`, `provider_customer_id`, `provider_subscription_id`, `provider_status` e `provider_raw`.
3. Execute `database/migrate_fix_assinaturas_rls.sql`.
4. Execute `database/migrate_payment_attempt_locks.sql`.

## Rodar

```bash
npm start
```

Abra:

```text
http://localhost:3002
```

Health check:

```http
GET http://localhost:3002/api/health
```

## Autenticacao

Use `session.access_token` no header das rotas protegidas:

```http
Authorization: Bearer SEU_ACCESS_TOKEN
```

## Rotas De Pagamento

Todas exigem usuario autenticado:

```http
POST /api/pagamentos/efi/criar-pix
POST /api/pagamentos/efi/criar-cartao
POST /api/pagamentos/efi/criar-boleto
POST /api/pagamentos/efi/pix
POST /api/pagamentos/efi/cartao
POST /api/pagamentos/efi/boleto
GET  /api/pagamentos/efi/status/:paymentId
POST /api/webhooks/efi
```

## Teste Gratis E Bloqueio

Ao cadastrar um usuario, o backend cria uma assinatura com `status = teste_gratis`, `plano = gratuito` e 7 dias de validade. O login continua funcionando depois do vencimento, mas rotas internas retornam HTTP `402` quando a assinatura esta bloqueada.

A rota `GET /api/assinaturas/status` retorna o estado atual para o frontend exibir avisos e redirecionar para `/checkout/`.

O roteiro completo de validacao manual esta em `../docs/assinatura-fluxo-testes.md`.

## Efí Bank

Configure:

```env
EFI_CLIENT_ID=seu_client_id_efi
EFI_CLIENT_SECRET=seu_client_secret_efi
EFI_ENVIRONMENT=sandbox
EFI_SANDBOX=true
EFI_PIX_KEY=sua_chave_pix_efi
EFI_CERT_PATH=./certs/efi.p12
EFI_CERT_BASE64=
EFI_WEBHOOK_SECRET=seu_token_webhook_efi
EFI_WEBHOOK_URL=https://seudominio.com/api/webhooks/efi
```

Cartao deve usar token seguro Efí. Numero, CVV e validade nao devem ser enviados ao backend.

A assinatura so e liberada pelo webhook Efí validado, apos consulta do pagamento e validacao de plano/valor.

Guia completo: `../docs/efi-bank-integracao.md`.

## Seguranca

- Supabase Auth
- Rotas protegidas por Bearer token
- Filtro obrigatorio por `user_id`
- RLS no banco
- CORS
- Helmet
- Rate Limit
- Tratamento global de erros
- Sanitizacao de `provider_raw`
