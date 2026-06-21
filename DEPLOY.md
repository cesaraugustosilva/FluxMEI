# Deploy FluxMEI

Este guia prepara o FluxMEI para:

- Frontend na Vercel
- Backend no Render
- Banco e Auth no Supabase
- Pagamentos na EFI Bank: Pix personalizado, cartao por token seguro e boleto
- Mercado Pago mantido como fallback/legado no backend
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
ENABLE_ASAAS=false
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
ASAAS_ENVIRONMENT=production
ASAAS_WALLET_ID=
```

Observacoes:

- O Render define `PORT` automaticamente. Nao e necessario cadastrar `PORT`.
- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY`, `EFI_CLIENT_SECRET`, certificado EFI, `MERCADO_PAGO_ACCESS_TOKEN`, `ASAAS_API_KEY` ou `GEMINI_API_KEY` na Vercel.
- Em producao, `EFI_WEBHOOK_SECRET` e obrigatorio para processar o webhook do checkout principal. `MERCADO_PAGO_WEBHOOK_SECRET` continua obrigatorio se o fallback Mercado Pago for testado. As variaveis Asaas existem apenas para legado/fallback tecnico. Mantenha `ENABLE_ASAAS=false` para desativar rotas publicas Asaas; use `ENABLE_ASAAS=true` somente se esse legado for operado de forma controlada.
- O backend mantem rate limit global e limites especificos para rotas sensiveis: login 10 tentativas/15min, cadastro 5/30min, recuperacao e nova senha 3/30min, pagamentos 20/15min. Ao exceder, a API retorna uma mensagem generica sem detalhes tecnicos.
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
2. Execute `backend/database/schema.sql`. Esse arquivo ja cria as colunas atuais de assinatura e pagamento, incluindo os campos genericos `payment_provider`, `provider_payment_id`, `provider_customer_id`, `provider_subscription_id`, `provider_status` e `provider_raw`.

Banco existente:

1. Revise `backend/database/migrate_trial_mercado_pago.sql`.
2. Execute somente se as colunas de trial e Mercado Pago ainda nao existirem.
3. Revise e execute `backend/database/migrate_payment_provider_fields.sql` para adicionar os campos genericos de processador em bancos criados antes dessa atualizacao, sem remover dados antigos.
4. Execute `backend/database/migrate_fix_assinaturas_rls.sql` para garantir que usuarios autenticados possam apenas consultar a propria assinatura. Insercoes, atualizacoes e exclusoes de assinatura devem ocorrer somente pelo backend com `SUPABASE_SERVICE_ROLE_KEY`.
5. Execute `backend/database/migrate_payment_attempt_locks.sql` para criar a trava transacional que impede duas cobrancas simultaneas para o mesmo usuario/provedor/plano. A mesma tabela atende Mercado Pago e EFI.

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

RLS:

- O schema habilita RLS nas tabelas do app.
- As policies restringem leitura e escrita ao `auth.uid()` do usuario.
- Em `assinaturas`, usuarios autenticados podem somente fazer `SELECT` da propria assinatura; nao ha policy de `INSERT`, `UPDATE` ou `DELETE` para o cliente.
- `payment_attempt_locks` nao tem acesso direto pelo cliente; o backend usa RPC com `SUPABASE_SERVICE_ROLE_KEY` para reservar e liberar tentativas antes de chamar Mercado Pago ou EFI.
- O backend usa `SUPABASE_SERVICE_ROLE_KEY`; mantenha essa chave somente no Render.

## EFI Bank

No painel da EFI Bank:

1. Crie a aplicacao e obtenha `EFI_CLIENT_ID` e `EFI_CLIENT_SECRET`.
2. Gere ou baixe o certificado da aplicacao. No Render, use `EFI_CERT_BASE64` ou monte o arquivo e aponte `EFI_CERT_PATH`.
3. Configure `EFI_ENVIRONMENT=sandbox` para homologacao e `EFI_ENVIRONMENT=production` para producao.
4. Configure a chave Pix em `EFI_PIX_KEY`.
5. Configure o webhook para:

```text
https://api.seudominio.com/api/webhooks/efi
```

6. Configure o mesmo segredo/token no Render:

```env
EFI_WEBHOOK_SECRET=seu_token_webhook_efi
EFI_WEBHOOK_URL=https://api.seudominio.com/api/webhooks/efi
```

Seguranca do webhook EFI:

- O backend aceita o segredo via `Authorization: Bearer`, `x-efi-webhook-secret`, `efi-webhook-secret` ou `x-webhook-secret`.
- Em producao, se `EFI_WEBHOOK_SECRET` estiver ausente, `POST /api/webhooks/efi` retorna 503 e nao processa pagamentos.
- Se o segredo estiver invalido, o webhook retorna 401 e nao ativa assinatura.
- A assinatura so e ativada quando o backend consulta a EFI e recebe status aprovado/concluido com plano e valor corretos.

Fluxo legado Mercado Pago:

1. Usuario acessa `https://seudominio.com/checkout/`.
2. Se escolher Pix, o frontend chama `https://api.seudominio.com/api/pagamentos/efi/criar-pix`.
3. O backend cria a cobranca Pix na EFI usando certificado e credenciais privadas.
4. O frontend exibe QR Code Pix, codigo copia e cola, botao copiar e botao de verificar pagamento.
5. Se escolher cartao, o frontend envia somente um token seguro de cartao para `https://api.seudominio.com/api/pagamentos/efi/criar-cartao`. Numero, CVV e validade nao devem passar pelo backend.
6. Se escolher boleto, o frontend chama `https://api.seudominio.com/api/pagamentos/efi/criar-boleto` e exibe link/linha digitavel retornados.
7. A EFI chama o webhook.
8. Backend consulta o pagamento e, se aprovado/concluido, atualiza assinatura para `ativo` e `bloqueado = false`.

Teste sandbox EFI:

1. Configure `EFI_ENVIRONMENT=sandbox`, `EFI_CLIENT_ID`, `EFI_CLIENT_SECRET`, `EFI_PIX_KEY` e certificado sandbox.
2. Abra `/checkout/?plan=pro_mensal` com usuario logado.
3. Gere Pix ou boleto.
4. Confirme no Supabase que a tentativa fica registrada como `payment_provider = 'efi'`.
5. Dispare ou aguarde webhook aprovado da EFI.
6. Confirme na tabela `assinaturas`: `status = 'ativo'`, `bloqueado = false`, `provider_status` aprovado/concluido e `provider_payment_id` preenchido.

## Mercado Pago Legado/Fallback

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

Fluxo esperado do checkout principal:

1. As rotas `/api/pagamentos/mercado-pago/*` permanecem disponiveis para fallback tecnico.
2. O frontend principal nao chama Mercado Pago.
3. Se o fallback for testado diretamente, mantenha `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_NOTIFICATION_URL` configurados.
4. Mercado Pago chama o webhook legado.
5. Backend consulta o pagamento e, se `approved`, atualiza assinatura para `ativo` e `bloqueado = false`.

O checkout principal nao chama Asaas, nao usa Checkout Pro e nao usa Payment Brick. EFI Bank e o gateway principal; Mercado Pago permanece como fallback/legado e `MERCADO_PAGO_ACCESS_TOKEN` continua somente no backend.

O endpoint legado de Checkout Pro `POST /api/pagamentos/mercado-pago/criar-checkout` fica desativado em producao e retorna `410 Gone` com a mensagem `Fluxo legado desativado. Utilize o checkout atual.`. Ele nao deve ser configurado em botoes, automacoes ou testes manuais.

Teste de pagamento Mercado Pago:

1. Configure `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_NOTIFICATION_URL`.
2. Abra `/checkout/?plan=pro_mensal` com usuario logado.
3. Chame diretamente uma rota legado Mercado Pago, se for necessario validar fallback.
4. Confirme que a tentativa fica registrada como `payment_provider = 'mercado_pago'`.
5. Aguarde o webhook aprovado para liberar a assinatura.

Teste de rejeicao Mercado Pago:

1. Em ambiente de homologacao com `MERCADO_PAGO_WEBHOOK_SECRET` configurado, envie uma notificacao sem `x-signature` ou com assinatura invalida.
2. Confirme HTTP 401.
3. Confirme no Supabase que a assinatura nao foi ativada.
4. Em producao, se o segredo estiver ausente por erro de configuracao, confirme HTTP 503 e corrija a variavel no Render antes de testar novamente.

URLs de retorno sao geradas com `FRONTEND_URL`.

## Asaas Legado/Fallback Tecnico

As rotas Asaas permanecem no backend para compatibilidade e validacoes tecnicas antigas, mas ficam desativadas por padrao com `ENABLE_ASAAS=false`. A EFI Bank e o gateway principal do checkout.

- `POST /api/pagamentos/asaas/criar-cobranca`
- `GET /api/pagamentos/asaas/status/:paymentId`
- `POST /api/webhooks/asaas`

Com `ENABLE_ASAAS=false`, as rotas publicas `/api/pagamentos/asaas/*` nao sao registradas e o webhook `/api/webhooks/asaas` retorna `410 ASAAS_DISABLED`. Essas rotas nao sao chamadas pelo checkout principal e nao devem aparecer na experiencia do usuario. Nao remova colunas ou dados antigos do banco neste momento.

Se o legado Asaas for testado diretamente, configure `ENABLE_ASAAS=true`, `ASAAS_API_KEY`, `ASAAS_BASE_URL` e `ASAAS_WEBHOOK_TOKEN`. O webhook Asaas valida `asaas-access-token` e pagamentos aprovados por esse legado continuam seguindo as regras do backend, mas isso nao faz parte do fluxo principal de checkout.

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
11. Gerar Pix EFI, boleto EFI ou pagar cartao com token seguro EFI.
12. Confirmar assinatura `ativo` no Supabase.
13. Confirmar acesso desbloqueado no app.
