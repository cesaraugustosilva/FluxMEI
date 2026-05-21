# FluxMEI Backend

Backend REST do FluxMEI usando Node.js, Express, Supabase PostgreSQL/Auth e Gemini API.
Nesta versÃ£o, o backend tambÃ©m serve o frontend estÃ¡tico, para facilitar o uso como software instalÃ¡vel/local.

## Requisitos

- Node.js 18+
- Projeto no Supabase
- Chave da Gemini API

## Instalação

```bash
cd backend
npm install
cp .env.example .env
```

Edite o `.env`:

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
```

Importante: `SUPABASE_SERVICE_ROLE_KEY` só deve ficar no backend.

## Banco de Dados

1. Abra o Supabase.
2. Vá em SQL Editor.
3. Cole e execute o conteúdo de `database/schema.sql`.

O schema cria:

- `profiles`
- `movimentacoes`
- `clientes`
- `das`
- `relatorios_ia`
- `assinaturas`

Também cria índices, triggers de `updated_at`, RLS e policies para cada usuário acessar apenas seus próprios dados.

## Rodar

```bash
npm run dev
```

Produção:

```bash
npm start
```

No Windows, tambÃ©m Ã© possÃ­vel usar os atalhos na raiz do projeto:

- `instalar-dependencias.cmd`
- `iniciar-fluxmei.cmd`

Abra o app em:

```http
http://localhost:3002
```

Health check:

```http
GET http://localhost:3002/api/health
```

As rotas da API ficam disponÃ­veis com prefixo `/api`, por exemplo `POST /api/auth/login`.
As rotas antigas sem prefixo foram mantidas para compatibilidade durante o desenvolvimento.

## Autenticação

### Cadastro

```http
POST /auth/register
Content-Type: application/json

{
  "email": "mei@email.com",
  "password": "senha12345",
  "nome": "Maria Silva",
  "nome_negocio": "Maria Silva MEI",
  "whatsapp": "(11) 99999-9999",
  "tipo_negocio": "Serviços"
}
```

### Login

```http
POST /auth/login
Content-Type: application/json

{
  "email": "mei@email.com",
  "password": "senha12345"
}
```

Use `session.access_token` no header das rotas protegidas:

```http
Authorization: Bearer SEU_ACCESS_TOKEN
```

### Usuário logado

```http
GET /auth/me
Authorization: Bearer SEU_ACCESS_TOKEN
```

### Reset de senha

```http
POST /auth/reset-password
Content-Type: application/json

{
  "email": "mei@email.com"
}
```

## Movimentações

```http
POST /movimentacoes
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{
  "tipo": "entrada",
  "descricao": "Venda",
  "valor": 150.50,
  "categoria": "Venda",
  "forma_pagamento": "pix",
  "data": "2026-05-20"
}
```

Filtros:

```http
GET /movimentacoes?mes=2026-05&tipo=entrada&categoria=Venda
GET /movimentacoes?data=2026-05-20
GET /movimentacoes/:id
PUT /movimentacoes/:id
DELETE /movimentacoes/:id
```

## Clientes

```http
POST /clientes
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{
  "nome": "Cliente Exemplo",
  "telefone": "(11) 99999-9999",
  "email": "cliente@email.com",
  "observacao": "Prefere PIX"
}
```

Rotas:

```http
GET /clientes
GET /clientes/:id
PUT /clientes/:id
DELETE /clientes/:id
```

## DAS

```http
POST /das
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{
  "mes_referencia": "2026-05",
  "vencimento": "2026-05-20",
  "valor": 75.90,
  "status": "pendente"
}
```

Rotas:

```http
GET /das
PUT /das/:id
DELETE /das/:id
PATCH /das/:id/pagar
```

A API retorna alertas quando o DAS está vencido ou vence em até 7 dias.

## Dashboard

```http
GET /dashboard?mes=2026-05
Authorization: Bearer SEU_ACCESS_TOKEN
```

Retorna saldo atual, entradas, saídas, lucro/prejuízo, clientes, maior despesa, melhor dia, próximo DAS e alertas.

## Calendário

```http
GET /calendario?mes=2026-05
Authorization: Bearer SEU_ACCESS_TOKEN
```

Retorna dados agrupados por dia.

## Relatórios

```http
GET /relatorios/diario
GET /relatorios/semanal
GET /relatorios/mensal?mes=2026-05
GET /relatorios/personalizado?inicio=2026-05-01&fim=2026-05-20
```

## Relatório com IA

Disponível apenas em planos Pro:

```http
POST /relatorios/ia
Authorization: Bearer SEU_ACCESS_TOKEN
Content-Type: application/json

{
  "inicio": "2026-05-01",
  "fim": "2026-05-20"
}
```

## Assinaturas e Planos

Planos:

```http
GET /planos
GET /assinaturas/planos
```

Assinaturas:

```http
GET /assinaturas
POST /assinaturas
PUT /assinaturas/:id
PATCH /assinaturas/:id/cancelar
```

Payload:

```json
{
  "plano": "pro_mensal",
  "status": "ativo"
}
```

## Limites do plano gratuito

O middleware bloqueia automaticamente:

- mais de 30 movimentações por mês
- mais de 5 clientes
- relatórios com IA

## Conectar outro frontend

O frontend incluÃ­do jÃ¡ detecta a API automaticamente quando servido pelo backend. Para outro frontend, use o prefixo `/api`:

```js
const API_URL = 'http://localhost:3002/api';

const response = await fetch(`${API_URL}/movimentacoes`, {
  headers: {
    Authorization: `Bearer ${accessToken}`
  }
});
```

Após o login, salve o `session.access_token` retornado pelo Supabase e envie no header `Authorization`.

## Segurança implementada

- Supabase Auth
- Rotas protegidas por Bearer token
- Filtro obrigatório por `user_id`
- RLS no banco
- CORS
- Helmet
- Rate Limit
- Tratamento global de erros
- Validação de campos obrigatórios
