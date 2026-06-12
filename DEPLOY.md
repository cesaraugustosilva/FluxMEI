# Deploy FluxMEI

Este guia prepara o FluxMEI para:

- Frontend na Vercel
- Backend no Render
- Banco e Auth no Supabase
- Pagamentos no Asaas, com Mercado Pago como fallback
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
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
ASAAS_ENVIRONMENT=production
ASAAS_WALLET_ID=
```

Observacoes:

- O Render define `PORT` automaticamente. Nao e necessario cadastrar `PORT`.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `ASAAS_API_KEY` ou `GEMINI_API_KEY` na Vercel.
- Em producao, `MERCADO_PAGO_WEBHOOK_SECRET` e `ASAAS_WEBHOOK_TOKEN` sao obrigatorios para processar webhooks. Se um deles faltar, o backend registra erro critico no startup e o webhook correspondente retorna 503 sem ativar assinatura.
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
3. Revise e execute `backend/database/migrate_payment_provider_fields.sql` para adicionar os campos genericos de processador sem remover dados antigos.
4. Execute `backend/database/migrate_fix_assinaturas_rls.sql` para garantir que usuarios autenticados possam apenas consultar a propria assinatura. Insercoes, atualizacoes e exclusoes de assinatura devem ocorrer somente pelo backend com `SUPABASE_SERVICE_ROLE_KEY`.

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
- Em `assinaturas`, usuarios autenticados podem somente fazer `SELECT` da propria assinatura; nao ha policy de `INSERT`, `UPDATE` ou `DELETE` para o cliente.
- O backend usa `SUPABASE_SERVICE_ROLE_KEY`; mantenha essa chave somente no Render.

## Asaas

No painel do Asaas:

1. Use credenciais sandbox para testes e producao somente no deploy final.
2. Configure o webhook de pagamentos:

```text
https://api.seudominio.com/api/webhooks/asaas
```

3. Configure o token do webhook no Asaas e no Render:

```env
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
```

Seguranca do webhook Asaas:

- O Asaas deve enviar o header `asaas-access-token` com o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
- Em producao, se `ASAAS_WEBHOOK_TOKEN` estiver ausente, `POST /api/webhooks/asaas` retorna 503 e nao processa o pagamento.
- Se o header estiver ausente ou incorreto, o webhook retorna 401 e nao ativa assinatura.
- Os logs registram apenas provider, evento, `payment_id`, status e resultado do processamento; tokens nao sao logados.

Fluxo esperado:

1. Usuario acessa `https://seudominio.com/checkout/`.
2. Frontend escolhe Asaas por padrao e chama `POST /api/pagamentos/asaas/criar-cobranca`.
3. Para plano mensal, o backend cria uma assinatura recorrente no Asaas em `/subscriptions`.
4. Para plano anual ou fallback avulso, o backend cria uma cobranca em `/payments`.
5. Para Pix, backend busca o QR Code em `/payments/{id}/pixQrCode` quando houver cobranca inicial.
6. Para boleto/cartao seguro, frontend exibe a URL da fatura/cobranca retornada pelo Asaas.
7. Asaas chama `POST /api/webhooks/asaas` com header `asaas-access-token`.
8. Backend valida o token, atualiza a assinatura e, quando pago, marca `status = ativo`, `bloqueado = false`, salva `provider_subscription_id` quando existir e atualiza `data_vencimento`.

Recorrencia Asaas:

- Plano mensal usa assinatura recorrente (`cycle = MONTHLY`) por padrao.
- Pix e boleto continuam exigindo pagamento pelo cliente a cada cobranca gerada pelo Asaas, mas o Asaas gera as cobrancas mensalmente.
- Cartao usa assinatura com `billingType = UNDEFINED` neste fluxo para permitir fatura segura Asaas sem coletar cartao no FluxMEI.
- Mercado Pago permanece como fallback legado e nao cria recorrencia.
- Webhook continua sendo a fonte oficial de ativacao; consulta manual de status nao ativa assinatura.
- Webhooks duplicados do mesmo pagamento nao devem avancar `data_vencimento` novamente.

Teste sandbox Asaas:

1. Configure `ASAAS_API_KEY` sandbox e, se necessario, `ASAAS_BASE_URL` do ambiente sandbox informado pelo Asaas.
2. Rode a migration `backend/database/migrate_payment_provider_fields.sql`.
3. Abra `/checkout/`, mantenha Asaas selecionado e gere Pix.
4. Confirme se a resposta contem `payment_id`, `payment_status` e `pix.qr_code`.
5. Gere boleto e confirme se `invoice_url` ou `bank_slip_url` abre corretamente.
6. Envie uma notificacao de webhook de teste com o header `asaas-access-token` igual ao `ASAAS_WEBHOOK_TOKEN`.
7. Confira no Supabase se `assinaturas.status = 'ativo'`, `bloqueado = false`, `payment_provider = 'asaas'` e `provider_status` pago.
8. Para plano mensal recorrente, confira tambem `provider_subscription_id`, `provider_customer_id`, `provider_payment_id`, `renovacao_automatica = true` e `data_vencimento` avancada.

Teste de rejeicao Asaas:

1. Envie a mesma notificacao sem o header `asaas-access-token` ou com valor diferente.
2. Confirme HTTP 401.
3. Confirme no Supabase que a assinatura nao foi ativada.

Teste sandbox de recorrencia Asaas:

1. Configure `ASAAS_API_KEY` sandbox, `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3` e `ASAAS_WEBHOOK_TOKEN`.
2. Cadastre um usuario e abra `/checkout/?plan=pro_mensal`.
3. Gere pagamento Asaas via Pix ou boleto.
4. Confirme no painel Asaas que uma assinatura foi criada e que ha uma cobranca inicial vinculada.
5. Pague/simule o pagamento da cobranca.
6. Aguarde o webhook `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`.
7. Confirme no Supabase que `status = ativo`, `bloqueado = false`, `provider_subscription_id` preenchido e `data_vencimento` avancada.
8. Simule vencimento (`PAYMENT_OVERDUE`) e confirme `status = vencido` e `bloqueado = true`.

## Mercado Pago Fallback

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

Seguranca do webhook Mercado Pago:

- O Mercado Pago deve enviar os headers `x-signature` e `x-request-id`.
- O backend valida a assinatura HMAC usando `MERCADO_PAGO_WEBHOOK_SECRET`.
- Em producao, se `MERCADO_PAGO_WEBHOOK_SECRET` estiver ausente, `POST /api/webhooks/mercado-pago` retorna 503 e nao processa o pagamento.
- Se a assinatura estiver ausente ou invalida, o webhook retorna 401 e nao ativa assinatura.
- Os logs registram apenas provider, evento, `payment_id`, status e resultado do processamento; secrets e headers completos nao sao logados.

Fluxo esperado:

1. Usuario acessa `https://seudominio.com/checkout/`.
2. Frontend carrega `MERCADO_PAGO_PUBLIC_KEY` via `https://api.seudominio.com/api/pagamentos/mercado-pago/public-config`.
3. Se o usuario escolher Mercado Pago como fallback, o Payment Brick exibe Pix, cartao e boleto dentro do FluxMEI, conforme disponibilidade do Mercado Pago.
4. Frontend chama `https://api.seudominio.com/api/pagamentos/mercado-pago/processar-brick`.
5. Backend cria o pagamento no Mercado Pago usando `MERCADO_PAGO_ACCESS_TOKEN`.
6. Mercado Pago chama o webhook.
7. Backend consulta o pagamento e, se `approved`, atualiza assinatura para `ativo` e `bloqueado = false`.

Teste de rejeicao Mercado Pago:

1. Em ambiente de homologacao com `MERCADO_PAGO_WEBHOOK_SECRET` configurado, envie uma notificacao sem `x-signature` ou com assinatura invalida.
2. Confirme HTTP 401.
3. Confirme no Supabase que a assinatura nao foi ativada.
4. Em producao, se o segredo estiver ausente por erro de configuracao, confirme HTTP 503 e corrija a variavel no Render antes de testar novamente.

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
10. Abrir `/checkout/`.
11. Pagar via Asaas Pix/boleto ou usar Mercado Pago como fallback.
12. Confirmar assinatura `ativo` no Supabase.
13. Confirmar acesso desbloqueado no app.
