# Teste Asaas Sandbox - FluxMEI

> Status: legado/fallback. O checkout principal do FluxMEI usa Mercado Pago Payment Brick. Use este roteiro apenas se for validar as rotas Asaas mantidas no backend.

Este roteiro valida o fluxo Asaas sandbox ponta a ponta sem usar chaves de producao.

## Objetivo

Validar:

1. operador chama a rota legada Asaas diretamente, sem usar o checkout principal;
2. plano mensal cria assinatura recorrente no Asaas;
3. Asaas gera cobranca vinculada a assinatura;
4. resposta da rota legada mostra dados de Pix/boleto quando a cobranca inicial existir;
5. webhook chega em `/api/webhooks/asaas`;
6. backend valida `asaas-access-token`;
7. Supabase atualiza a assinatura;
8. usuario volta ao painel com acesso liberado.

## Variaveis Necessarias

No Render ou ambiente de homologacao:

```env
NODE_ENV=production
APP_PUBLIC_URL=https://api.seudominio.com
FRONTEND_URL=https://seudominio.com,https://www.seudominio.com

ASAAS_API_KEY=sua_api_key_sandbox
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
ASAAS_WEBHOOK_TOKEN=um_token_forte_configurado_no_asaas

SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
```

Na Vercel:

```env
FLUXMEI_API_URL=https://api.seudominio.com/api
```

Importante:

- `ASAAS_API_KEY` sandbox deve ser diferente da chave de producao.
- `ASAAS_BASE_URL` sandbox deve apontar para `https://api-sandbox.asaas.com/v3`.
- `ASAAS_WEBHOOK_TOKEN` deve ser igual ao token cadastrado no webhook do Asaas.
- Nunca colocar `ASAAS_API_KEY` ou `SUPABASE_SERVICE_ROLE_KEY` na Vercel.

## Onde Pegar A API Key Sandbox

1. Acesse o painel sandbox do Asaas.
2. Entre na area de integracoes/API.
3. Gere ou copie a API key do ambiente sandbox.
4. Cadastre essa chave somente no backend, por exemplo no Render.

Se a chave for de producao por engano, o teste pode criar cobrancas reais. Pare e corrija antes de continuar.

## Configurar Webhook Sandbox

No painel sandbox do Asaas:

1. Cadastre a URL:

```text
https://api.seudominio.com/api/webhooks/asaas
```

2. Configure o token do webhook com o mesmo valor de `ASAAS_WEBHOOK_TOKEN`.
3. Habilite eventos de pagamento e assinatura, especialmente:

- `PAYMENT_RECEIVED`
- `PAYMENT_CONFIRMED`
- `PAYMENT_OVERDUE`
- `PAYMENT_DELETED`
- `SUBSCRIPTION_CREATED`
- `SUBSCRIPTION_UPDATED`
- `SUBSCRIPTION_DELETED`

## Gerar Assinatura/Cobranca

1. Faca login no FluxMEI com usuario de teste.
2. Nao use `/checkout/` para este teste; o checkout principal usa Mercado Pago.
3. Chame diretamente `POST /api/pagamentos/asaas/criar-cobranca`.
4. Informe Pix ou boleto no payload legado.
5. Confirme a resposta da API.

Resultado esperado:

- Backend cria assinatura recorrente no Asaas.
- `assinaturas.payment_provider = 'asaas'`.
- `assinaturas.provider_customer_id` preenchido.
- `assinaturas.provider_subscription_id` preenchido.
- Se o Asaas ja gerar a primeira cobranca, `provider_payment_id` tambem deve ficar preenchido.
- A resposta da API mostra QR Code Pix ou link de boleto quando a cobranca inicial estiver disponivel.
- Se o Asaas ainda nao retornar cobranca inicial, a resposta deve indicar a pendencia.

## Simular Pagamento

No painel sandbox do Asaas:

1. Abra a assinatura criada.
2. Abra a cobranca inicial vinculada.
3. Use a opcao de confirmar/receber pagamento no sandbox.
4. Aguarde o webhook.

Eventos aceitos para liberar:

- `PAYMENT_RECEIVED`
- `PAYMENT_CONFIRMED`

Resultado esperado no Supabase:

```text
status = ativo
bloqueado = false
payment_provider = asaas
provider_subscription_id preenchido
provider_payment_id preenchido
provider_status = RECEIVED ou CONFIRMED
data_vencimento avancada
```

## Verificar Logs No Render

No Render, abra os logs do backend e procure por:

```text
[webhook:event]
```

Logs esperados:

```text
provider: asaas
event: PAYMENT_RECEIVED ou PAYMENT_CONFIRMED
payment_id: pay_...
subscription_id: sub_...
status: RECEIVED ou CONFIRMED
outcome: processing
```

Depois da atualizacao:

```text
outcome: applied
```

Os logs nao devem exibir:

- `ASAAS_API_KEY`
- `ASAAS_WEBHOOK_TOKEN`
- dados completos do cliente
- email, CPF, CNPJ ou telefone

## Verificar No Supabase

Na tabela `assinaturas`, filtre pelo usuario de teste e confirme:

```text
status = ativo
bloqueado = false
payment_provider = asaas
provider_customer_id is not null
provider_subscription_id is not null
provider_payment_id is not null
provider_status in ('RECEIVED', 'CONFIRMED')
renovacao_automatica = true
data_vencimento > current_date
```

Para pagamento vencido (`PAYMENT_OVERDUE`), esperado:

```text
status = vencido
bloqueado = true
```

## Verificar Frontend

Antes do webhook:

- Checkout deve mostrar pagamento pendente.
- Botao "Ja paguei, verificar" pode consultar o status, mas nao deve ativar assinatura sozinho.
- Painel deve continuar bloqueado se assinatura ainda estiver pendente.

Depois do webhook confirmado:

- `GET /api/assinaturas/status` deve retornar `estado = ativo`.
- Painel deve carregar normalmente.
- Rotas protegidas como `/api/dashboard` devem retornar 200.

## Como Saber Se Passou

O teste passou se:

- assinatura recorrente aparece no painel sandbox do Asaas;
- cobranca inicial aparece vinculada a assinatura;
- webhook chega no Render com `outcome: processing` e depois `outcome: applied`;
- Supabase mostra assinatura ativa e desbloqueada;
- usuario acessa o painel sem bloqueio.

## Como Saber Se Falhou

Falhou se:

- `provider_subscription_id` fica vazio para plano mensal;
- webhook nao aparece nos logs do Render;
- webhook retorna 401 ou 503;
- `status` fica `pendente` apos pagamento confirmado;
- `bloqueado` continua `true`;
- painel continua bloqueado apos webhook confirmado.

## Erros Comuns E Solucoes

### Webhook nao chega

Verifique:

- URL cadastrada no Asaas esta correta.
- Backend esta publicado e acessivel via HTTPS.
- Health check `/api/health` responde.
- Webhook foi cadastrado no ambiente sandbox, nao producao.
- Eventos de pagamento estao habilitados no painel Asaas.

### Webhook retorna 401

Provavel token incorreto.

Verifique:

- Header `asaas-access-token` enviado pelo Asaas.
- Valor de `ASAAS_WEBHOOK_TOKEN` no Render.
- Token cadastrado no painel Asaas.

### Webhook retorna 503

Configuracao insegura em producao.

Verifique:

- `ASAAS_WEBHOOK_TOKEN` existe no Render.
- Backend foi redeployado depois da alteracao.

### Checkout nao gera assinatura

Verifique:

- `ASAAS_API_KEY` sandbox no Render.
- `ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3`.
- Usuario esta logado.
- `FLUXMEI_API_URL` aponta para o backend correto.
- Logs do Render mostram erro retornado pelo Asaas.

### Frontend nao mostra Pix/boleto

Possiveis causas:

- Asaas criou assinatura, mas ainda nao retornou a primeira cobranca.
- A cobranca inicial nao foi listada pelo filtro de subscription.
- Metodo escolhido nao gerou QR/link imediatamente.

Verifique no painel Asaas se existe cobranca vinculada a assinatura.

## Proximos Passos Se O Webhook Nao Chegar

1. Teste manualmente `GET https://api.seudominio.com/api/health`.
2. Reenvie o webhook pelo painel Asaas, se houver essa opcao.
3. Confira se o webhook foi criado no painel sandbox.
4. Confira se o dominio do backend tem SSL valido.
5. Confira logs do Render no horario exato do evento.
6. Se nao houver log nenhum, o Asaas nao chamou a URL correta.
7. Se houver log com 401, corrija `ASAAS_WEBHOOK_TOKEN`.
8. Se houver log com `ignored_no_subscription`, confira `provider_subscription_id`, `provider_payment_id` e `externalReference`.
