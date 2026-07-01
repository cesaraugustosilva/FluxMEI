# FluxMEI

FluxMEI e um SaaS de gestao financeira para MEIs. O produto centraliza receitas, despesas, clientes, DAS, metas, assinaturas, trial, checkout, cupons, indicacoes, auditoria, exportacao, backup, admin e FluxIA.

## Arquitetura

```text
/
backend/   API Node.js/Express
frontend/  app web estatico HTML/CSS/JS
tests/     testes automatizados
scripts/   orquestracao local e deploy-check
```

A raiz do projeto e um orquestrador npm. O backend possui suas dependencias em `backend/package.json`. O frontend possui build proprio para gerar `env.js`.

## Tecnologias

- Frontend HTML, CSS e JavaScript.
- Backend Node.js e Express.
- Supabase para Auth, Postgres, RLS e service role.
- Asaas como gateway principal.
- Efi preservado como fallback tecnico.
- Gemini para FluxIA.
- Render para backend.
- Vercel para frontend.
- `node:test` para testes automatizados.

## Como rodar

```bash
npm install
copy backend\.env.example backend\.env
npm run dev
```

Servicos:

```text
Backend:  http://localhost:3002
Frontend: http://localhost:5173
Health:   http://localhost:3002/api/health
```

Scripts principais:

```bash
npm run dev
npm run dev:backend
npm run dev:frontend
npm run build
npm test
npm run lint
npm run deploy-check
```

## Estrutura de pastas

```text
backend/src/controllers/  controllers HTTP
backend/src/routes/       rotas Express
backend/src/services/     regras de integracao e servicos
backend/src/middleware/   autenticacao, admin, erros e seguranca
backend/database/         schema e migrations SQL
frontend/                 telas, assets, scripts e env.js gerado
tests/                    testes de backend, frontend estatico e seguranca
```

## Fluxo de pagamentos

O Asaas e o gateway principal para Pix, boleto e cartao. Pix e boleto continuam no fluxo do FluxMEI. Cartao usa ambiente seguro/tokenizado para reduzir trafego de dados sensiveis pelo backend. A ativacao de assinatura depende da confirmacao do provedor via webhook, preservando historico, recibos e idempotencia.

A Efi permanece isolada como fallback tecnico e nao deve ser expandida sem decisao explicita de produto.

## FluxIA

A FluxIA usa Gemini no backend. As chaves `GEMINI_API_KEY` e `GEMINI_MODEL` ficam apenas no ambiente do backend. O contexto enviado ao modelo deve ser minimo, sanitizado e sem secrets.

## Open Finance

Open Finance esta planejado no roadmap. Ainda nao faz parte do fluxo produtivo principal e deve entrar como modulo separado, com consentimento explicito, trilha de auditoria e revisao de seguranca antes de producao.

## Roadmap

- Consolidar deploy padronizado Render + Vercel.
- Fortalecer observabilidade de pagamentos, webhook e assinaturas.
- Evoluir admin, auditoria, exportacao e backup.
- Expandir FluxIA com limites de uso e metricas de custo.
- Planejar Open Finance com escopo regulatorio claro.

## Deploy

Consulte [DEPLOY.md](DEPLOY.md) para variaveis obrigatorias, Render, Vercel, build, testes e checklist antes do deploy.
