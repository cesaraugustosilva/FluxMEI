# FluxMEI Backend

Backend REST do FluxMEI usando Node.js, Express, Supabase PostgreSQL/Auth, Gemini API, Asaas e Efí Bank como fallback tecnico.

## Requisitos

- Node.js 18+
- Projeto no Supabase
- Chave da Gemini API
- Credenciais Asaas
- Credenciais Efí Bank, se usar fallback tecnico

## Configuracao

Na raiz do projeto:

```bash
npm install
copy backend\.env.example backend\.env
```

Edite `backend/.env` com as variaveis do arquivo exemplo. Em local, a porta padrao e `3002`.

Importante: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `EFI_CLIENT_SECRET` e certificados Efí ficam somente no backend.

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
5. Execute `database/migrate_subscription_management.sql` para cancelamento/reativacao e deduplicacao de notificacoes.

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
POST /api/pagamentos/asaas/criar-pix
POST /api/pagamentos/asaas/criar-boleto
POST /api/pagamentos/asaas/criar-cartao
GET  /api/pagamentos/asaas/status/:paymentId
POST /api/webhooks/asaas

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

## Asaas

Gateway principal do FluxMEI para Pix, boleto e cartao:

```env
PAYMENT_GATEWAY=asaas
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
ASAAS_WEBHOOK_URL=https://fluxmei.onrender.com/api/webhooks/asaas
```

Em producao, use `ASAAS_BASE_URL=https://api.asaas.com/v3`.

O cartao Asaas usa o fluxo documentado de `billingType=CREDIT_CARD` com `creditCard` e `creditCardHolderInfo` enviados somente no request backend -> Asaas. O FluxMEI nao salva numero, CVV, validade nem titular completo em `provider_raw`, e nao expoe `ASAAS_API_KEY` no frontend. A tokenizacao Asaas existe via API/token por cliente, mas depende de habilitacao em producao; quando disponivel, prefira token/checkout hospedado do Asaas para reduzir escopo PCI.

Configure o webhook Asaas em:

```text
https://fluxmei.onrender.com/api/webhooks/asaas
```

Eventos minimos: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED_IN_CASH`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED` e `PAYMENT_CHARGEBACK_REQUESTED`.

O backend valida o header `asaas-access-token` com `ASAAS_WEBHOOK_TOKEN` e consulta o Asaas antes de ativar assinatura. Cartao aprovado imediatamente tambem ativa a assinatura no retorno da criacao; pagamentos pendentes aguardam webhook.

## E-mails Automaticos

O FluxMEI envia e-mails transacionais com provider isolado em `backend/src/services/emailService.js` e templates em `backend/src/services/notificationService.js`.

```env
EMAIL_PROVIDER=resend
RESEND_API_KEY=sua_chave_resend
EMAIL_FROM=FluxMEI <no-reply@seudominio.com>
```

Eventos cobertos: pagamento confirmado, boas-vindas ao Pro, pagamento pendente, assinatura vencendo em 7/3 dias, assinatura vencida, cancelamento agendado e reativacao. A tabela `notification_events` evita envio duplicado por usuario, tipo e chave de evento.

## Efí Bank

Fallback tecnico. Configure somente se for manter as rotas Efí disponiveis:

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

Cartao Efí permanece indisponivel no checkout; nao remova as rotas enquanto Efí existir como fallback tecnico.

A assinatura so e liberada pelo webhook validado do gateway, apos consulta do pagamento e validacao de plano/valor.

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
