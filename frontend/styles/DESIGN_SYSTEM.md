# FluxMEI Design System

Fundacao visual oficial do FluxMEI para telas futuras e refatoracoes graduais. O arquivo principal e:

```html
<link rel="stylesheet" href="/styles/design-system.css">
```

Importante: este CSS ainda nao deve ser importado nas telas existentes sem uma tarefa especifica de migracao visual. A criacao deste Design System nao altera Dashboard, Checkout, FluxIA, Admin, Minha Conta ou Landing Page.

## Principios

- Premium sem exagero: superficies limpas, sombras discretas e bom espaco em branco.
- Fintech profissional: verde como acento principal, feedback semantico claro e hierarquia objetiva.
- Acessivel: foco visivel, contraste consistente e estados previsiveis.
- Opt-in: classes e tokens usam prefixo `fm-` para evitar conflito com CSS legado.

## Tokens

### Cores

Use tokens CSS em vez de valores soltos.

```css
var(--fm-color-primary)
var(--fm-color-primary-hover)
var(--fm-color-primary-light)

var(--fm-color-success)
var(--fm-color-warning)
var(--fm-color-danger)
var(--fm-color-info)

var(--fm-color-background)
var(--fm-color-surface)
var(--fm-color-card)
var(--fm-color-border)

var(--fm-color-text-primary)
var(--fm-color-text-secondary)
var(--fm-color-text-muted)
var(--fm-color-sidebar)
```

### Espacamento

Escala oficial:

```css
--fm-space-1: 4px;
--fm-space-2: 8px;
--fm-space-3: 12px;
--fm-space-4: 16px;
--fm-space-5: 20px;
--fm-space-6: 24px;
--fm-space-8: 32px;
--fm-space-10: 40px;
--fm-space-12: 48px;
--fm-space-16: 64px;
```

Use a escala para padding, gap, margin e grids. Evite numeros novos sem motivo forte.

### Bordas

```css
--fm-radius-1: 6px;
--fm-radius-2: 8px;
--fm-radius-3: 12px;
--fm-radius-4: 16px;
--fm-radius-5: 20px;
--fm-radius-pill: 999px;
```

Padrao recomendado: `8px` para controles e `12px` para cards.

### Sombras

```css
--fm-shadow-sm
--fm-shadow-md
--fm-shadow-lg
```

Use sombras com parcimonia. Para SaaS/fintech, prefira borda + sombra pequena.

## Tipografia

Classes utilitarias:

```html
<h1 class="fm-display">FluxMEI</h1>
<h1 class="fm-h1">Dashboard</h1>
<h2 class="fm-h2">Relatorio financeiro</h2>
<h3 class="fm-h3">Resumo</h3>
<strong class="fm-card-title">Saldo atual</strong>
<p class="fm-text">Texto padrao.</p>
<p class="fm-text-sm">Texto pequeno.</p>
<span class="fm-caption">Legenda</span>
```

Boas praticas:

- Use `fm-display` apenas em heroes ou telas muito editoriais.
- Use `fm-card-title` dentro de cards, tabelas e paineis compactos.
- Mantenha letter spacing em `0`.

## Botoes

Base:

```html
<button class="fm-btn fm-btn-primary">Salvar</button>
<button class="fm-btn fm-btn-secondary">Continuar</button>
<button class="fm-btn fm-btn-outline">Cancelar</button>
<button class="fm-btn fm-btn-danger">Excluir</button>
<button class="fm-btn fm-btn-ghost">Mais opcoes</button>
```

Uso recomendado:

- `primary`: acao principal da tela ou modal.
- `secondary`: acao importante alternativa.
- `outline`: acao neutra.
- `danger`: acao destrutiva.
- `ghost`: acoes discretas em barras, menus ou cards.

## Formularios

```html
<label class="fm-field">
  <span class="fm-label">Nome</span>
  <input class="fm-input" placeholder="Digite seu nome">
</label>

<label class="fm-field">
  <span class="fm-label">Observacao</span>
  <textarea class="fm-textarea"></textarea>
</label>

<label class="fm-field">
  <span class="fm-label">Plano</span>
  <select class="fm-select">
    <option>Mensal</option>
  </select>
</label>
```

Checkbox, radio e switch:

```html
<label class="fm-check-row">
  <input class="fm-checkbox" type="checkbox">
  Receber avisos
</label>

<label class="fm-radio-row">
  <input class="fm-radio" type="radio" name="periodo">
  Mensal
</label>

<button class="fm-switch" role="switch" aria-checked="true"></button>
```

## Cards

```html
<article class="fm-card fm-card-simple">Card simples</article>
<article class="fm-card fm-card-premium">Card premium</article>
<article class="fm-card fm-card-glass">Card glass</article>
<article class="fm-card fm-card-simple fm-card-hover">Card com hover</article>
```

Use cards para itens repetidos, paineis e modais. Evite colocar card dentro de card.

## Badges

```html
<span class="fm-badge fm-badge-success">Pago</span>
<span class="fm-badge fm-badge-warning">Pendente</span>
<span class="fm-badge fm-badge-danger">Vencido</span>
<span class="fm-badge fm-badge-info">Info</span>
```

## Alertas, Toasts e Tooltips

```html
<div class="fm-alert fm-alert-success">Assinatura ativa.</div>
<div class="fm-alert fm-alert-warning">Pagamento pendente.</div>
<div class="fm-alert fm-alert-danger">Falha ao salvar.</div>
<div class="fm-alert fm-alert-info">Nova atualizacao disponivel.</div>

<div class="fm-toast">Alteracoes salvas.</div>
<div class="fm-tooltip">Descricao curta da acao.</div>
```

## Modal, Dropdown e Tabs

```html
<div class="fm-modal-backdrop">
  <section class="fm-modal">
    <header class="fm-modal-header">Titulo</header>
    <div class="fm-modal-body">Conteudo</div>
    <footer class="fm-modal-footer">
      <button class="fm-btn fm-btn-outline">Cancelar</button>
      <button class="fm-btn fm-btn-primary">Confirmar</button>
    </footer>
  </section>
</div>
```

```html
<div class="fm-dropdown">
  <button class="fm-dropdown-item">Editar</button>
  <button class="fm-dropdown-item">Excluir</button>
</div>
```

```html
<div class="fm-tabs" role="tablist">
  <button class="fm-tab" aria-selected="true">Resumo</button>
  <button class="fm-tab" aria-selected="false">Historico</button>
</div>
```

## Tabelas

```html
<div class="fm-table-wrap">
  <table class="fm-table">
    <thead>
      <tr>
        <th>Data</th>
        <th>Descricao</th>
        <th>Valor</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>26/06/2026</td>
        <td>Venda</td>
        <td>R$ 120,00</td>
      </tr>
    </tbody>
  </table>
</div>
```

`fm-table-wrap` garante responsividade horizontal em telas pequenas.

## Loading

```html
<div class="fm-spinner"></div>
<div class="fm-skeleton" style="height: 16px"></div>
<div class="fm-loading-dots"><span></span><span></span><span></span></div>
```

## Animacoes

```html
<div class="fm-animate-fade">Fade</div>
<div class="fm-animate-slide">Slide</div>
<div class="fm-animate-scale">Scale</div>
<div class="fm-hover-lift">Hover lift</div>
```

Use movimento leve. Animacoes devem ajudar orientacao, nao chamar atencao demais.

## Scrollbar e Focus

Use `fm-scrollbar` em areas rolaveis opt-in:

```html
<div class="fm-scrollbar">...</div>
```

Use `fm-focusable` quando um elemento customizado precisar de foco visual:

```html
<button class="fm-focusable">Acao</button>
```

## Dark Mode

O Design System responde a:

```html
<html data-theme="dark">
```

ou:

```html
<div class="fm-theme-dark">...</div>
```

Nunca duplique tokens para dark mode em componentes. Ajuste os tokens em `:root[data-theme="dark"]` ou `.fm-theme-dark`.

## Boas praticas de adocao

- Migrar uma tela por vez.
- Antes de importar o Design System em uma tela existente, comparar screenshots desktop/mobile.
- Nao misturar classes antigas e `fm-*` no mesmo componente quando isso criar conflito.
- Preferir tokens `--fm-*` para qualquer novo componente.
- Nao usar sombras fortes, gradientes decorativos ou cantos grandes sem necessidade.
- Manter interfaces operacionais densas, escaneaveis e objetivas.
