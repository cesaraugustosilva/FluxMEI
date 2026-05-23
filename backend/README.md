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
