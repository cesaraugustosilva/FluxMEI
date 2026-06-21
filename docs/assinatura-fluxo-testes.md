# FluxMEI - fluxo de assinatura e testes manuais

Este roteiro valida o fluxo atual de assinatura sem ativar assinatura pelo frontend e sem enfraquecer RLS ou webhooks.

## Mapa Do Fluxo Atual

1. Cadastro com teste gratis
   - Frontend envia cadastro normal.
   - Backend cria assinatura `plano=gratuito`, `status=teste_gratis`, `bloqueado=false`, `teste_gratis_usado=true`.

2. Cadastro com assinatura direta
   - Landing/checkout salvam `fluxmei_intent=subscribe` e `fluxmei_subscribe_plan`.
   - Backend cria assinatura `status=pendente`, `bloqueado=true`, sem trial automatico.

3. Login e retorno para checkout
   - Login salva `fluxmei_access_token`.
   - Checkout le o token e envia `Authorization: Bearer <token>`.

4. Checkout e pagamento
   - Pix: `POST /api/pagamentos/efi/pix`.
   - Boleto: `POST /api/pagamentos/efi/boleto`.
   - Cartao: `POST /api/pagamentos/efi/cartao`.
   - Consulta de status nao ativa assinatura; ativacao depende do webhook Efí validado.

5. Webhook e ativacao
   - Webhook: `POST /api/webhooks/efi`.
   - Backend valida segredo, consulta a Efí, confere plano/valor/tentativa atual e ativa assinatura se o pagamento estiver aprovado/concluido.

## Rotas Dev Seguras

Disponiveis somente fora de producao e com usuario autenticado:

```http
POST /api/dev/expirar-trial
POST /api/dev/bloquear-assinatura
POST /api/dev/liberar-assinatura
```

## Cenarios Manuais

### 1. Usuario Novo Com Teste Gratis

1. Na landing, clique em "Comecar teste gratis".
2. Cadastre uma conta nova.
3. Abra `/app/`.
4. Chame `GET /api/assinaturas/status`.

Esperado: `status=teste_gratis`, `allowed=true` e rotas internas retornam 200.

### 2. Usuario Novo Com Assinatura Direta

1. Clique em assinar um plano.
2. Cadastre uma conta nova.
3. Confirme retorno para `/checkout/?intent=subscribe&plan=...`.
4. Chame `GET /api/assinaturas/status`.

Esperado: `status=pendente`, `bloqueado=true`, sem trial automatico.

### 3. Usuario Com Trial Expirado

1. Login com usuario em trial.
2. Chame `POST /api/dev/expirar-trial`.
3. Abra `/app/` ou chame `/api/dashboard`.

Esperado: bloqueio e HTTP 402 nas rotas protegidas.

### 4. Usuario Com Pagamento Pendente

1. Abra checkout logado.
2. Crie uma cobranca Pix ou boleto.
3. Nao envie webhook aprovado.
4. Clique em "Ja paguei, verificar pagamento".

Esperado: assinatura continua pendente/bloqueada e o painel do meio de pagamento continua visivel.

### 5. Usuario Com Assinatura Ativa

1. Em desenvolvimento, chame `POST /api/dev/liberar-assinatura`.
2. Abra `/app/`.
3. Chame `/api/dashboard`.

Esperado: `estado=ativo` e rotas protegidas retornam 200.

### 6. Webhook Invalido

1. Envie `POST /api/webhooks/efi` sem segredo ou com segredo incorreto.

Esperado: HTTP 401 ou 503 em producao e assinatura nao ativa.

### 7. Webhook Valido

1. Configure `EFI_WEBHOOK_SECRET` no backend e no painel Efí.
2. Gere cobranca real de sandbox.
3. Pague ou use simulacao oficial.
4. Aguarde webhook.

Esperado: pagamento aprovado ativa assinatura; pagamento pendente mantem bloqueio; pagamento cancelado/vencido nao libera acesso.
