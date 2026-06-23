# Integracao EFI Bank no FluxMEI

## Pacote oficial

O backend usa o SDK oficial `sdk-node-apis-efi`, configurado em `backend/src/services/efiService.js`.

Instalacao, quando necessario:

```bash
cd backend
npm install sdk-node-apis-efi
```

## Variaveis de ambiente

Configure no backend:

```env
EFI_CLIENT_ID=seu_client_id
EFI_CLIENT_SECRET=seu_client_secret
EFI_PIX_KEY=sua_chave_pix
EFI_CERT_PATH=./certs/efi.p12
EFI_CERT_BASE64=
EFI_CERT_PASSPHRASE=
EFI_SANDBOX=true
EFI_ENVIRONMENT=sandbox
EFI_WEBHOOK_SECRET=um_segredo_forte
EFI_WEBHOOK_URL=https://fluxmei.onrender.com/api/webhooks/efi
```

Use `EFI_ENVIRONMENT=production` ou `EFI_SANDBOX=false` apenas em producao.

## Certificado `.p12`

1. Baixe o certificado da aplicacao no painel da EFI Bank.
2. Salve o arquivo fora do versionamento, por exemplo `backend/certs/efi.p12`.
3. Aponte `EFI_CERT_PATH` para esse arquivo.
4. Em hospedagens onde arquivo local nao e pratico, use `EFI_CERT_BASE64` com o conteudo do `.p12` codificado em base64.
5. Se o certificado tiver senha, configure `EFI_CERT_PASSPHRASE`.

Nunca commite certificados, secrets ou tokens.

## Rotas de pagamento

Rotas novas:

```http
POST /api/pagamentos/efi/pix
POST /api/pagamentos/efi/boleto
POST /api/pagamentos/efi/cartao
```

Rotas legadas mantidas por compatibilidade com o checkout atual:

```http
POST /api/pagamentos/efi/criar-pix
POST /api/pagamentos/efi/criar-boleto
POST /api/pagamentos/efi/criar-cartao
GET  /api/pagamentos/efi/status/:paymentId
```

Todas exigem usuario autenticado e usam `paymentRateLimiter`.

## Teste local no PowerShell

O backend local usa a porta `3002`.

As rotas de pagamento exigem `Authorization: Bearer <token>`. Para pegar o token do usuario logado:

1. Acesse `http://localhost:3002/checkout/` ou o app local.
2. Faca login.
3. Abra o DevTools do navegador.
4. Rode no Console:

```js
sessionStorage.getItem('fluxmei_access_token') || localStorage.getItem('fluxmei_access_token')
```

5. Copie o token retornado para a variavel `$token` no PowerShell.

No Windows, prefira `Invoke-RestMethod`; `curl` pode ser alias do PowerShell e nao aceitar `-X`, `-H` e `-d` como no Linux.

### Pix

```powershell
$token = "COLE_O_TOKEN_DO_USUARIO_LOGADO"

$body = @{
  plano = "pro_mensal"
  valor = 49.90
  nome = "Cliente Teste"
  email = "teste@fluxmei.com.br"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3002/api/pagamentos/efi/pix" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

Resposta esperada inclui:

- `txid`
- `status` / `payment_status`
- `qr_code`
- `qr_code_base64`, quando disponivel
- `copia_e_cola`
- `valor`
- `plano`

### Boleto

```powershell
$token = "COLE_O_TOKEN_DO_USUARIO_LOGADO"

$body = @{
  plano = "pro_mensal"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "http://localhost:3002/api/pagamentos/efi/boleto" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

Resposta esperada inclui:

- `charge_id`
- `status` / `payment_status`
- `bank_slip_url` ou `invoice_url`
- `digitable_line`
- `due_date`
- `valor`
- `plano`

### Cartao

```powershell
$token = "COLE_O_TOKEN_DO_USUARIO_LOGADO"

$body = @{
  plano = "pro_mensal"
  payment = @{
    payment_token = "TOKEN_SEGURO_EFI"
    installments = 1
  }
} | ConvertTo-Json -Depth 4

Invoke-RestMethod `
  -Uri "http://localhost:3002/api/pagamentos/efi/cartao" `
  -Method POST `
  -Headers @{ Authorization = "Bearer $token" } `
  -ContentType "application/json" `
  -Body $body
```

Resposta esperada inclui `charge_id`, `status` / `payment_status`, `valor` e `plano`. Em caso de recusa, o backend retorna mensagem clara da EFI quando ela estiver disponivel. O backend nao deve receber numero, CVV ou validade do cartao.

## Pix

O Pix cria uma cobranca imediata com:

- valor do plano;
- nome/documento do cliente, quando disponivel;
- `txid`;
- QR Code;
- codigo Pix copia e cola;
- metadata interna com `user_id`, `assinatura_id` e `plano`.

## Boleto

O boleto retorna:

- link/PDF;
- linha digitavel;
- vencimento;
- `charge_id`;
- metadata interna para conciliacao.

## Cartao

O cartao usa checkout transparente por token seguro EFI. No frontend estatico, o checkout carrega a biblioteca oficial de tokenizacao:

```html
<script src="https://cdn.jsdelivr.net/gh/efipay/js-payment-token-efi/dist/payment-token-efi-umd.min.js"></script>
```

A opcao Cartao so aparece quando `window.FLUXMEI_CONFIG.EFI_PAYEE_CODE` esta configurado e `EfiPay.CreditCard` esta disponivel no navegador.

Variaveis publicas do frontend:

```env
FLUXMEI_EFI_PAYEE_CODE=identificador_publico_da_conta_efi
FLUXMEI_EFI_ENVIRONMENT=production
```

`FLUXMEI_EFI_PAYEE_CODE` e o Identificador de conta/payee_code exibido na Efí em `API > Introducao > Identificador de conta`. Ele e publico para tokenizacao. Nao confundir com `EFI_CLIENT_SECRET`, certificado, token OAuth ou chave Pix, que nunca devem ir ao frontend.

Campos do formulario:

- nome impresso no cartao
- numero do cartao
- validade
- CVV
- CPF/CNPJ
- parcelas

O frontend deve enviar apenas o token:

```json
{
  "plano": "pro_mensal",
  "payment": {
    "payment_token": "token_seguro_efi",
    "installments": 1
  }
}
```

Numero, CVV, validade e dados sensiveis do cartao nao devem chegar ao backend.

## Webhook Pix via API

O webhook Pix da EFI pode nao aparecer como opcao manual no painel. Para Pix, o cadastro e feito pela API:

```http
PUT /v2/webhook/:chave
GET /v2/webhook/:chave
```

O FluxMEI usa `EFI_PIX_KEY` como `:chave` e cadastra a URL:

```text
https://fluxmei.onrender.com/api/webhooks/efi?secret=<EFI_WEBHOOK_SECRET>&ignorar=
```

Em desenvolvimento, com usuario autenticado, use as rotas protegidas:

```http
POST /api/dev/efi/register-webhook
GET  /api/dev/efi/webhook
```

Essas rotas nao sao registradas quando `NODE_ENV=production`. Em producao, execute o cadastro com uma ferramenta administrativa temporaria ou script seguro usando as mesmas variaveis EFI do backend, sem expor `EFI_WEBHOOK_SECRET`, certificado ou chave Pix em frontend/logs.

Se houver uma opcao manual no painel EFI para outros webhooks/cobrancas, a URL base continua sendo:

```text
https://fluxmei.onrender.com/api/webhooks/efi
```

Se houver dominio proprio de API, use o dominio real da API:

```text
https://api.seudominio.com/api/webhooks/efi
```

O backend valida `EFI_WEBHOOK_SECRET`. Envie o segredo por um destes headers:

- `Authorization: Bearer <EFI_WEBHOOK_SECRET>`
- `x-efi-webhook-secret`
- `efi-webhook-secret`
- `x-webhook-secret`

Se o painel da Efí nao permitir configurar headers customizados, configure o webhook com query string:

```text
https://fluxmei.onrender.com/api/webhooks/efi?secret=<EFI_WEBHOOK_SECRET>&ignorar=
```

Em producao, o webhook EFI e recusado se `EFI_WEBHOOK_SECRET` nao estiver configurado.

## Ativacao automatica

Quando o webhook recebe um evento:

1. valida o segredo;
2. consulta a EFI pelo `txid` de Pix, `charge_id` de cobrancas ou `notification` da API Cobrancas;
3. localiza a assinatura;
4. valida pagamento atual, plano e valor;
5. ativa a assinatura quando o status for aprovado/concluido;
6. remove bloqueio;
7. registra metodo, status, pagamento e vencimento;
8. ignora webhooks duplicados sem avancar vencimento novamente.

Para registrar a data de pagamento, execute a migracao `backend/database/migrate_payment_provider_fields.sql`, que adiciona `paid_at` em `assinaturas`.

## Teste de ativacao no Supabase

1. Gere Pix, boleto ou cartao pelo checkout.
2. Confirme que `assinaturas.payment_provider = 'efi'`.
3. Confirme que `provider_payment_id` contem o `txid` do Pix ou `charge_id` de boleto/cartao.
4. Pague ou simule pagamento na Efí.
5. Aguarde o webhook em `https://fluxmei.onrender.com/api/webhooks/efi`.
6. Verifique em `assinaturas`:
   - `status = 'ativo'`
   - `bloqueado = false`
   - `paid_at` preenchido
   - `data_vencimento` com +30 dias no mensal ou +365 dias no anual.

## Idempotencia e auditoria

O backend usa trava transacional por usuario/provedor/plano antes de criar cobrancas.

`provider_raw` salva apenas dados sanitizados e uteis para conciliacao. Tokens, certificados, secrets, QR Code completo e dados sensiveis de cartao nao sao persistidos.

Logs relevantes usam o prefixo:

```text
[webhook:event]
[webhook:efi]
[startup:webhooks]
```
