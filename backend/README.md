# FluxMEI Backend

Backend REST do FluxMEI usando Node.js, Express, Supabase PostgreSQL/Auth e Gemini API. O backend tambem serve o frontend estatico para uso web em uma unica origem.

## Requisitos
- Node.js 18+
- Projeto no Supabase
- Chave da Gemini API

## Configuracao
Na raiz do projeto:

```bash
npm install
copy backend\.env.example backend\.env
```

Edite `backend/.env`:

```env
NODE_ENV=production
PORT=3002
FRONTEND_URL=http://localhost:3002
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
GEMINI_API_KEY=sua_gemini_api_key
JWT_SECRET=opcional_para_integracoes_futuras
AUTH_AUTO_CONFIRM_EMAIL=false
ALLOW_SELF_MANAGED_SUBSCRIPTIONS=false
MERCADO_PAGO_PUBLIC_KEY=sua_public_key_mercado_pago
MERCADO_PAGO_ACCESS_TOKEN=seu_access_token_mercado_pago
MERCADO_PAGO_BASE_URL=https://api.mercadopago.com
MERCADO_PAGO_USE_SANDBOX=false
MERCADO_PAGO_WEBHOOK_SECRET=seu_secret_do_webhook
MERCADO_PAGO_NOTIFICATION_URL=https://seudominio.com/api/webhooks/mercado-pago
ENABLE_ASAAS=false
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_BASE_URL=https://api.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=seu_token_webhook_asaas
ASAAS_ENVIRONMENT=production
ASAAS_WALLET_ID=
```

Importante: `SUPABASE_SERVICE_ROLE_KEY`, `MERCADO_PAGO_ACCESS_TOKEN` e `ASAAS_API_KEY` so devem ficar no backend. O checkout principal usa Mercado Pago; Asaas permanece apenas como fluxo legado/fallback no backend e fica desativado por padrao com `ENABLE_ASAAS=false`.

## Banco De Dados
Banco novo:

1. Abra o Supabase.
2. Va em SQL Editor.
3. Cole e execute o conteudo de `database/schema.sql`.

Banco existente:

1. Execute `database/migrate_payment_provider_fields.sql` se o banco ainda nao tiver os campos genericos de pagamento `payment_provider`, `provider_payment_id`, `provider_customer_id`, `provider_subscription_id`, `provider_status` e `provider_raw`.
2. Mantenha `database/migrate_fix_assinaturas_rls.sql` aplicado para garantir que usuarios autenticados possam apenas consultar a propria assinatura.

O schema cria `profiles`, `movimentacoes`, `clientes`, `das`, `relatorios_ia` e `assinaturas`, com campos atuais de pagamento, indices, triggers de `updated_at`, RLS e policies por usuario.

Para bancos existentes, execute tambem `database/migrate_fix_assinaturas_rls.sql`.
Essa migration remove policies de `INSERT`, `UPDATE` e `DELETE` em `assinaturas`
para usuarios autenticados e mantem apenas `SELECT` da propria assinatura. O
backend continua criando e atualizando assinaturas com `SUPABASE_SERVICE_ROLE_KEY`,
que deve ficar somente no servidor.

## Rodar
Na raiz do projeto:

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

As rotas da API ficam disponiveis com prefixo `/api`, por exemplo `POST /api/auth/login`.

## Autenticacao
Use `session.access_token` no header das rotas protegidas:

```http
Authorization: Bearer SEU_ACCESS_TOKEN
```

Principais rotas:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/reset-password`

## Recursos
- `GET /api/movimentacoes`
- `POST /api/movimentacoes`
- `GET /api/clientes`
- `POST /api/clientes`
- `GET /api/das`
- `POST /api/das`
- `GET /api/dashboard`
- `GET /api/calendario`
- `GET /api/relatorios/mensal`
- `POST /api/relatorios/ia`
- `GET /api/planos`
- `GET /api/assinaturas`
- `GET /api/assinaturas/status`
- `POST /api/pagamentos/mercado-pago/criar-checkout` legado/desativado, retorna `410 Gone`
- `GET /api/pagamentos/mercado-pago/public-config`
- `POST /api/pagamentos/mercado-pago/processar-brick`
- `GET /api/pagamentos/mercado-pago/status/:paymentId`
- `GET /api/pagamentos/mercado-pago/sincronizar?payment_id=ID`
- `POST /api/webhooks/mercado-pago`
- `POST /api/pagamentos/asaas/criar-cobranca`
- `GET /api/pagamentos/asaas/status/:paymentId`
- `POST /api/webhooks/asaas`

## Teste Gratis E Bloqueio
Ao cadastrar um usuario, o backend cria uma assinatura com `status = teste_gratis`, `plano = gratuito` e 7 dias de validade. O login continua funcionando depois do vencimento, mas rotas internas como movimentacoes, clientes, DAS, dashboard, calendario e relatorios retornam HTTP `402` quando a assinatura esta bloqueada.

A rota `GET /api/assinaturas/status` retorna o estado atual para o frontend exibir avisos e redirecionar para `/checkout/`.

O roteiro completo de validacao manual esta em `../docs/assinatura-fluxo-testes.md`.

## Asaas Legado/Fallback

O Mercado Pago e o gateway principal. Asaas e legado tecnico e nao deve ficar exposto para usuarios. Com `ENABLE_ASAAS=false`, `/api/pagamentos/asaas/*` nao e registrado e `/api/webhooks/asaas` retorna `410 ASAAS_DISABLED`.

1. Para reativar o legado, defina `ENABLE_ASAAS=true`.
2. Em banco novo, confirme que `database/schema.sql` ja foi executado. Em banco existente, execute `database/migrate_payment_provider_fields.sql` no Supabase para adicionar os campos genericos `payment_provider`, `provider_payment_id`, `provider_customer_id`, `provider_subscription_id`, `provider_status` e `provider_raw`.
3. Configure `ASAAS_API_KEY`, `ASAAS_BASE_URL` e `ASAAS_WEBHOOK_TOKEN`.
3. No painel do Asaas, cadastre o webhook apontando para:

```text
https://seudominio.com/api/webhooks/asaas
```

O webhook valida o header `asaas-access-token`. Em producao, `ASAAS_WEBHOOK_TOKEN`
e obrigatorio; se estiver ausente, o webhook retorna 503 e nao processa o pagamento.
O frontend principal nao usa mais Asaas. Se o fluxo legado for chamado diretamente,
a assinatura so deve ser considerada liberada apos confirmacao validada pelo
backend/webhook.

No fluxo legado mensal, o backend pode criar uma assinatura recorrente no Asaas. O campo
`provider_subscription_id` fica salvo em `assinaturas` e os pagamentos mensais
gerados pelo Asaas atualizam `status`, `bloqueado` e `data_vencimento` por webhook.
Essas rotas foram mantidas para compatibilidade, mas nao aparecem na experiencia
principal de checkout.

## Mercado Pago
1. Configure as variaveis `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_NOTIFICATION_URL`. Em producao, `MERCADO_PAGO_WEBHOOK_SECRET` e obrigatorio; se estiver ausente, o webhook retorna 503 e nao processa o pagamento.
2. No painel do Mercado Pago, cadastre o webhook de pagamentos apontando para:

```text
https://seudominio.com/api/webhooks/mercado-pago
```

Em testes locais reais, use uma URL publica temporaria, como ngrok, porque o Mercado Pago precisa acessar seu backend.

Fluxo de teste:
1. Criar usuario.
2. Confirmar que `GET /api/assinaturas/status` mostra `teste_gratis`.
3. Forcar vencimento no banco alterando `data_vencimento` para uma data passada.
4. Acessar rota protegida e verificar HTTP `402`.
5. Abrir `http://localhost:3002/checkout/`.
6. Criar assinatura pela tela.
7. Gerar Pix personalizado ou pagar cartao/boleto pelo Payment Brick.
8. Confirmar que a assinatura ficou `ativo` e `bloqueado = false`.

`/checkout/` usa Mercado Pago como unico gateway. Pix e criado pelo backend em
`/api/pagamentos/mercado-pago/criar-pix` e exibido na tela do FluxMEI; cartao e
boleto seguem pelo Payment Brick. O frontend recebe apenas
`MERCADO_PAGO_PUBLIC_KEY`; o backend usa `MERCADO_PAGO_ACCESS_TOKEN` para criar
pagamentos em `/v1/payments`. A assinatura deve ser liberada pelo webhook em
producao. Em ambiente local, sem URL publica de webhook, a resposta do pagamento
pode aparecer aprovada enquanto a assinatura permanece pendente ate a notificacao
ser recebida ou a sincronizacao ser feita manualmente.

O fluxo antigo Mercado Pago Checkout Pro foi mantido apenas como historico no
codigo e nao deve ser usado. `POST /api/pagamentos/mercado-pago/criar-checkout`
retorna `410 Gone` com mensagem de fluxo legado desativado; ele nao cria
preferencia, nao registra tentativa e nao altera assinatura.

## Seguranca
- Supabase Auth
- Rotas protegidas por Bearer token
- Filtro obrigatorio por `user_id`
- RLS no banco
- CORS
- Helmet
- Rate Limit
- Tratamento global de erros
- Validacao de campos obrigatorios
