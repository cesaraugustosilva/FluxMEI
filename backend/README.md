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
```

Importante: `SUPABASE_SERVICE_ROLE_KEY` so deve ficar no backend.

## Banco De Dados
1. Abra o Supabase.
2. Va em SQL Editor.
3. Cole e execute o conteudo de `database/schema.sql`.

O schema cria `profiles`, `movimentacoes`, `clientes`, `das`, `relatorios_ia` e `assinaturas`, com indices, triggers de `updated_at`, RLS e policies por usuario.

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
- `POST /api/pagamentos/mercado-pago/criar-checkout`
- `GET /api/pagamentos/mercado-pago/public-config`
- `POST /api/pagamentos/mercado-pago/processar-brick`
- `GET /api/pagamentos/mercado-pago/sincronizar?payment_id=ID`
- `POST /api/webhooks/mercado-pago`

## Teste Gratis E Bloqueio
Ao cadastrar um usuario, o backend cria uma assinatura com `status = teste_gratis`, `plano = gratuito` e 7 dias de validade. O login continua funcionando depois do vencimento, mas rotas internas como movimentacoes, clientes, DAS, dashboard, calendario e relatorios retornam HTTP `402` quando a assinatura esta bloqueada.

A rota `GET /api/assinaturas/status` retorna o estado atual para o frontend exibir avisos e redirecionar para `/checkout/`.

## Mercado Pago
1. Configure as variaveis `MERCADO_PAGO_PUBLIC_KEY`, `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e `MERCADO_PAGO_NOTIFICATION_URL`.
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
7. Pagar pelo Payment Brick ou enviar uma notificacao de teste do Mercado Pago.
8. Confirmar que a assinatura ficou `ativo` e `bloqueado = false`.

`/checkout/` usa Payment Brick do Mercado Pago. O frontend recebe apenas
`MERCADO_PAGO_PUBLIC_KEY`; o backend usa `MERCADO_PAGO_ACCESS_TOKEN` para criar
pagamentos em `/v1/payments`. A assinatura deve ser liberada pelo webhook em
producao. Em ambiente local, sem URL publica de webhook, a resposta do pagamento
pode aparecer aprovada enquanto a assinatura permanece pendente ate a notificacao
ser recebida ou a sincronizacao ser feita manualmente.

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
