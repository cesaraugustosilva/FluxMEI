# FluxMEI - fluxo de assinatura e testes manuais

Este roteiro valida o fluxo atual de assinatura sem ativar assinatura pelo frontend e sem enfraquecer RLS ou webhooks.

## Mapa do fluxo atual

1. Cadastro com teste gratis
   - Frontend: `frontend/auth/shared/auth.js`, `register()`.
   - Backend: `POST /api/auth/register`, `authController.register`.
   - Se nao houver `subscription_intent=subscribe`, o backend chama `assinaturaService.createTrialSubscription`.
   - Resultado esperado: assinatura `plano=gratuito`, `status=teste_gratis`, `bloqueado=false`, `teste_gratis_usado=true`.

2. Cadastro com assinatura direta
   - Landing/checkout salvam `fluxmei_intent=subscribe` e `fluxmei_subscribe_plan`.
   - Frontend envia `subscription_intent=subscribe` e `plano`.
   - Backend chama `assinaturaService.createPendingSubscription`.
   - Resultado esperado: assinatura `status=pendente`, `bloqueado=true`, sem trial automatico.

3. Login e retorno para checkout
   - Login salva `fluxmei_access_token`.
   - Se existir intent de assinatura, `redirectAfterAuth()` envia para `/checkout/?intent=subscribe&plan=...`.
   - Checkout le o token em `localStorage` e envia `Authorization: Bearer <token>`.

4. Status e bloqueio
   - Frontend app chama `GET /api/auth/me` e `GET /api/assinaturas/status`.
   - Rotas principais usam `checkSubscriptionAccess`.
   - `assinaturaService.evaluateAccess` permite trial ativo ou assinatura ativa.
   - Trial vencido, assinatura vencida, pagamento pendente ou assinatura bloqueada retornam bloqueio/HTTP 402 nas rotas protegidas.

5. Checkout e pagamento
   - Checkout exige token para criar cobranca.
   - `POST /api/pagamentos/mercado-pago/processar-brick` registra tentativa como `pendente`.
   - O fluxo legado `POST /api/pagamentos/asaas/criar-cobranca` so deve ser testado com `ENABLE_ASAAS=true`.
   - Consulta de status do pagamento nao ativa assinatura; a ativacao depende de webhook valido.

6. Webhook e ativacao
   - Asaas legado: `POST /api/webhooks/asaas`, com header `asaas-access-token`, apenas com `ENABLE_ASAAS=true`.
   - Mercado Pago: `POST /api/webhooks/mercado-pago`, com assinatura `x-signature`.
   - Apenas webhook validado chama a aplicacao de pagamento na assinatura.

## Rotas dev seguras

Disponiveis somente fora de producao e com usuario autenticado:

```http
POST /api/dev/expirar-trial
POST /api/dev/bloquear-assinatura
POST /api/dev/liberar-assinatura
```

Exemplos:

```bash
curl -X POST http://localhost:3002/api/dev/expirar-trial \
  -H "Authorization: Bearer SEU_TOKEN"

curl -X POST http://localhost:3002/api/dev/bloquear-assinatura \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"status\":\"pendente\"}"

curl -X POST http://localhost:3002/api/dev/liberar-assinatura \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"plano\":\"pro_mensal\"}"
```

## Cenários manuais

### 1. Usuario novo com teste gratis

1. Na landing, clique em "Comecar teste gratis".
2. Cadastre uma conta nova.
3. Faca login se houver confirmacao de email.
4. Abra `/app/`.
5. Confirme que o painel carrega.
6. Chame `GET /api/assinaturas/status`.

Esperado:
- `status=teste_gratis`
- `estado=teste_gratis`
- `allowed=true`
- rotas como `/api/dashboard` retornam 200.

### 2. Usuario novo com assinatura direta

1. Na landing, clique em "Assinar mensal agora" ou "Assinar anual com desconto".
2. Cadastre uma conta nova.
3. Faca login se necessario.
4. Confirme que volta para `/checkout/?intent=subscribe&plan=...`.
5. Chame `GET /api/assinaturas/status`.

Esperado:
- `status=pendente`
- `estado=pendente_pagamento`
- `bloqueado=true`
- usuario nao recebe trial automatico.
- checkout consegue criar cobranca com token valido.

### 3. Usuario com trial expirado

1. Login com usuario em trial.
2. Chame `POST /api/dev/expirar-trial`.
3. Abra `/app/` ou chame `/api/dashboard`.

Esperado:
- `GET /api/assinaturas/status` marca bloqueio.
- `/api/dashboard` retorna 402.
- painel mostra bloqueio e CTA para checkout.

### 4. Usuario com pagamento pendente

1. Abra checkout logado.
2. Crie uma cobranca Pix/boleto.
3. Nao envie webhook de pagamento aprovado.
4. Clique em "Ja paguei, verificar pagamento".

Esperado:
- assinatura continua `status=pendente`, `bloqueado=true`.
- status de pagamento pode aparecer como pendente/aprovado pelo provedor, mas a assinatura so muda apos webhook valido.

### 5. Usuario com assinatura ativa

1. Em desenvolvimento, chame `POST /api/dev/liberar-assinatura`.
2. Abra `/app/`.
3. Chame `/api/dashboard`.

Esperado:
- `GET /api/assinaturas/status` retorna `estado=ativo`.
- rotas protegidas retornam 200.
- painel fica liberado.

### 6. Webhook invalido

1. Se o legado Asaas estiver habilitado com `ENABLE_ASAAS=true`, envie webhook Asaas sem `asaas-access-token` correto.
2. Envie webhook Mercado Pago sem assinatura valida.

Esperado em producao/homologacao:
- Asaas retorna 401.
- Mercado Pago retorna 401.
- assinatura nao ativa.

### 7. Webhook valido

1. Configure token/secret no provedor e no backend.
2. Gere cobranca real de sandbox.
3. Pague ou use simulacao oficial do provedor.
4. Aguarde webhook.

Esperado:
- pagamento aprovado ativa assinatura.
- pagamento pendente mantem `status=pendente`.
- pagamento recusado/cancelado mantem assinatura bloqueada/cancelada.

## Pontos manuais obrigatorios

- Validar assinatura real do Mercado Pago com headers oficiais.
- Validar webhook real Asaas com `asaas-access-token`.
- Validar credenciais e URLs no Render.
- Confirmar URLs de redirect no Supabase Auth.
