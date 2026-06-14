/* =========================================
   FluxMEI — app.js
   Controle Financeiro para MEI
   ========================================= */

'use strict';

// ===== CONSTANTS =====
const CATEGORIAS_ENTRADA = ['Venda', 'Serviço', 'Pagamento de Cliente', 'Outros'];
const CATEGORIAS_SAIDA   = ['DAS', 'Fornecedor', 'Aluguel', 'Internet', 'Transporte', 'Marketing', 'Outros'];
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MESES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
function normalizeApiUrl(url) {
  return String(url || '').replace(/\/$/, '');
}

function resolveApiUrls() {
  const apiUrl = normalizeApiUrl(window.FLUXMEI_CONFIG?.API_URL);
  if (!apiUrl) throw new Error('FLUXMEI_CONFIG.API_URL nao configurada.');
  return [apiUrl];
}
const API_URLS = resolveApiUrls();
const TOKEN_KEY = 'fluxmei_access_token';
const DASHBOARD_MONTH_KEY = 'fluxmei_dashboard_mes';
const CUSTOM_CATEGORIES_KEY = 'fluxmei_custom_categories';
const MOV_CLIENT_LINKS_KEY = 'fluxmei_mov_client_links';
const THEME_KEY = 'fluxmei_theme';
const DEFAULT_ACCOUNT_PLANS = [
  {
    id: 'gratuito',
    nome: 'Teste gratis',
    preco: 0,
    priceLabel: 'R$ 0 por 7 dias',
    description: 'Ideal para conhecer a plataforma.',
    recursos: ['Acesso completo', '7 dias de teste', 'Nao renovavel']
  },
  {
    id: 'pro_mensal',
    nome: 'Plano Pro Mensal',
    preco: 49.9,
    priceLabel: 'R$ 49,90 por mes',
    description: 'Acesso completo para organizar o financeiro do MEI.',
    recursos: ['Controle financeiro', 'DAS', 'Metas', 'Relatorios']
  },
  {
    id: 'pro_anual',
    nome: 'Plano Pro Anual',
    preco: 478.8,
    priceLabel: 'R$ 478,80 por ano',
    description: 'Mesmo acesso completo com economia no ano.',
    recursos: ['Controle financeiro', 'DAS', 'Metas', 'Relatorios']
  }
];

// ===== STATE =====
let state = {
  movimentacoes: [],
  clientes: [],
  das: [],
  user: null,
  profile: null,
  planos: DEFAULT_ACCOUNT_PLANS,
  config: { nome: '', cpf: '', cnpj: '', ramo: '', dasDia: '', dasValor: '' }
};

let currentPage = 'dashboard';
let calendarDate = new Date();
let movTipo = 'entrada';
let editingMovId = null;
let editingClienteId = null;
let dashChart = null;
let relChart = null;
let dashboardMes = localStorage.getItem(DASHBOARD_MONTH_KEY) || '';
let subscriptionStatus = null;

function getSavedTheme() {
  return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme) {
  if (typeof window.applyFluxmeiTheme === 'function') {
    window.applyFluxmeiTheme(theme);
    return;
  }

  document.documentElement.dataset.theme = theme;
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    const nextTheme = theme === 'dark' ? 'claro' : 'escuro';
    const label = theme === 'dark' ? 'Claro' : 'Escuro';
    const text = button.querySelector('.theme-toggle-text');

    button.dataset.activeTheme = theme;
    button.setAttribute('aria-label', `Ativar modo ${nextTheme}`);
    button.title = `Ativar modo ${nextTheme}`;
    if (text) text.textContent = label;
  });
}

function toggleTheme() {
  applyTheme(getSavedTheme() === 'dark' ? 'light' : 'dark');
}

function setupThemeControls() {
  applyTheme(getSavedTheme());

  document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
    button.addEventListener('click', toggleTheme);
  });
}

function getCustomCategories() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '{}');
    return {
      entrada: Array.isArray(parsed.entrada) ? parsed.entrada : [],
      saida: Array.isArray(parsed.saida) ? parsed.saida : []
    };
  } catch {
    return { entrada: [], saida: [] };
  }
}

function saveCustomCategories(categories) {
  localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify({
    entrada: Array.isArray(categories.entrada) ? categories.entrada : [],
    saida: Array.isArray(categories.saida) ? categories.saida : []
  }));
}

function normalizeCategoryName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function sortCategories(categories) {
  return categories.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
}

function getCategoriasPorTipo(tipo) {
  const defaults = tipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  const custom = getCustomCategories()[tipo] || [];
  const used = state.movimentacoes
    .filter((mov) => mov.tipo === tipo && mov.cat)
    .map((mov) => mov.cat);
  return sortCategories([...new Set([...defaults, ...custom, ...used])]);
}

// ===== API =====
function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('fluxmei_user');
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('fluxmei_user');
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = '../auth/login/index.html';
    throw new Error('Faça login para continuar.');
  }

  let response;
  let url = '';

  for (const apiUrl of API_URLS) {
    url = `${apiUrl}${path}`;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });
      if (response.status === 404 && apiUrl !== API_URLS[API_URLS.length - 1]) continue;
      localStorage.setItem('fluxmei_api_url', apiUrl);
      break;
    } catch {
      response = null;
    }
  }

  if (!response) {
    throw new Error('Nao foi possivel conectar a API. Verifique a configuracao FLUXMEI_API_URL.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  const text = isJson ? '' : await response.text();

  if (response.status === 401) {
    clearAuthStorage();
    window.location.href = '../auth/login/index.html';
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  if (response.status === 402) {
    showSubscriptionLock(data || {});
    const error = new Error(data?.message || data?.error || 'Teste grátis expirado');
    error.code = data?.code || 'TRIAL_EXPIRED';
    error.redirectTo = data?.redirectTo || '/checkout/';
    throw error;
  }

  if (!response.ok) {
    const message = data?.message || data?.error || text?.trim();
    throw new Error(message || `Erro ${response.status} ao chamar ${url}.`);
  }
  return data;
}

function mapMovimentacao(item) {
  const meta = parseMetaObservacao(item.observacao);
  const localLinks = getMovClientLinks();
  return {
    id: item.id,
    tipo: item.tipo,
    desc: item.descricao,
    valor: Number(item.valor),
    cat: item.categoria,
    pag: item.forma_pagamento,
    data: item.data,
    obs: meta.texto,
    clienteId: meta.cliente_id || localLinks[item.id] || ''
  };
}

function renderSubscriptionNotice(status) {
  subscriptionStatus = status;
  updateSidebarUser();
  const banner = document.getElementById('subscriptionBanner');
  const bannerTitle = document.getElementById('subscriptionBannerTitle');
  const bannerText = document.getElementById('subscriptionBannerText');
  const bannerAction = document.getElementById('subscriptionBannerAction');
  const lock = document.getElementById('subscriptionLock');
  const lockTitle = document.getElementById('subscriptionLockTitle');
  const lockText = document.getElementById('subscriptionLockText');
  if (!banner || !lock || !status) return;

  const estado = status.estado || status.status;
  const isBlocked = status.bloqueado || ['expirado', 'bloqueado', 'pendente_pagamento', 'vencido', 'pendente'].includes(estado);

  if (isBlocked) {
    banner.style.display = 'none';
    if (lockTitle) {
      lockTitle.textContent = estado === 'pendente_pagamento'
        ? 'Pagamento pendente'
        : 'Seu acesso expirou';
    }
    if (lockText) {
      lockText.textContent = status.mensagem || 'Para continuar usando o FluxMEI e acessar seus dados, escolha um plano.';
    }
    lock.style.display = 'grid';
    return;
  }

  lock.style.display = 'none';

  if (estado === 'teste_gratis') {
    const dias = Number(status.dias_restantes || 0);
    if (bannerTitle) bannerTitle.textContent = dias <= 2 ? 'Seu teste gratis termina em breve' : 'Teste gratis ativo';
    if (bannerText) {
      bannerText.textContent = status.mensagem || (
        dias <= 2
          ? 'Assine agora para continuar usando sem interrupcoes.'
          : `Voce esta no teste gratis do FluxMEI. Faltam ${dias} dia(s) para o fim do teste.`
      );
    }
    banner.className = `subscription-banner${dias <= 2 ? ' warning' : ''}`;
    if (bannerAction) bannerAction.style.display = '';
    banner.style.display = 'flex';
    return;
  }

  if (estado === 'ativo') {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'none';
}
function getPlanLabel(status = subscriptionStatus) {
  const plano = status?.plano || 'gratuito';
  const statusAtual = status?.status || '';
  const estado = status?.estado || statusAtual;

  if (estado === 'pendente_pagamento') return 'Pagamento pendente';
  if (estado === 'expirado' || estado === 'bloqueado') return 'Teste expirado';
  if (estado === 'teste_gratis' || plano === 'gratuito') return 'Teste gratis';
  if (plano === 'pro_anual' || plano === 'anual') return 'Plano Pro Anual';
  if (plano === 'pro_mensal' || plano === 'mensal') return 'Plano Pro Mensal';
  if (estado === 'ativo') return 'Plano Pro';
  return 'Plano gratuito';
}

function formatPlanPrice(plan) {
  if (plan.priceLabel) return plan.priceLabel;
  const preco = Number(plan.preco || 0);
  if (!preco) return 'R$ 0 por 7 dias';
  const suffix = plan.tipo_cobranca === 'anual' ? 'por ano' : 'por mes';
  return `${formatBRL(preco)} ${suffix}`;
}

function normalizePlan(plan) {
  const fallback = DEFAULT_ACCOUNT_PLANS.find((item) => item.id === plan.id) || {};
  return {
    ...fallback,
    ...plan,
    priceLabel: plan.priceLabel || formatPlanPrice({ ...fallback, ...plan }),
    description: plan.description || fallback.description || 'Acesso completo ao FluxMEI.',
    recursos: plan.recursos || fallback.recursos || []
  };
}

async function loadAvailablePlans() {
  try {
    const planos = await apiRequest('/assinaturas/planos');
    if (Array.isArray(planos) && planos.length) {
      state.planos = planos.map(normalizePlan);
      return;
    }
  } catch {
    // Keep local fallback plans when the public plans endpoint is unavailable.
  }
  state.planos = DEFAULT_ACCOUNT_PLANS;
}

function getAccountStatusMeta(status = subscriptionStatus) {
  const estado = status?.estado || status?.status || 'teste_gratis';
  const dias = Number(status?.dias_restantes || 0);

  if (estado === 'ativo') return { label: 'Plano liberado', className: 'active' };
  if (estado === 'pendente_pagamento' || estado === 'pendente') return { label: 'Pagamento pendente', className: 'pending' };
  if (estado === 'expirado' || estado === 'vencido' || estado === 'bloqueado') return { label: 'Teste gratis expirado', className: 'blocked' };
  if (estado === 'teste_gratis' && dias <= 2) return { label: 'Teste termina em breve', className: 'warning' };
  if (estado === 'teste_gratis') return { label: 'Teste gratis ativo', className: 'active' };
  return { label: 'Status indisponivel', className: 'blocked' };
}

function getCurrentPlanId(status = subscriptionStatus) {
  const estado = status?.estado || status?.status;
  if (estado === 'teste_gratis' || status?.plano === 'gratuito') return 'gratuito';
  return status?.plano || 'gratuito';
}

function renderAccountPanel() {
  const nome = state.profile?.nome || state.config.nome || state.user?.user_metadata?.nome || 'Usuario FluxMEI';
  const email = state.user?.email || 'Email nao informado';
  const status = subscriptionStatus || {};
  const currentPlanId = getCurrentPlanId(status);
  const currentPlan = state.planos.find((plan) => plan.id === currentPlanId) || state.planos[0];
  const statusMeta = getAccountStatusMeta(status);
  const estado = status.estado || status.status;
  const dias = Number(status.dias_restantes || 0);
  const isActive = estado === 'ativo';
  const isPending = estado === 'pendente_pagamento' || estado === 'pendente';

  document.getElementById('accountName').textContent = nome;
  document.getElementById('accountEmail').textContent = email;
  document.querySelectorAll('.account-avatar').forEach((avatar) => {
    avatar.textContent = nome.charAt(0).toUpperCase();
  });
  document.getElementById('accountCurrentPlan').textContent = currentPlan?.nome || getPlanLabel(status);

  const badge = document.getElementById('accountStatusBadge');
  badge.textContent = statusMeta.label;
  badge.className = `account-status-badge ${statusMeta.className}`;

  const statusText = estado === 'ativo'
    ? 'Acesso completo habilitado.'
    : (status.mensagem || (estado === 'teste_gratis'
      ? `Faltam ${dias} dia(s) para o fim do teste.`
      : 'Acompanhe seu plano e assinatura por aqui.'));
  document.getElementById('accountStatusText').textContent = statusText;

  const plansRoot = document.getElementById('accountPlans');
  plansRoot.innerHTML = state.planos.map((plan) => {
    const selected = plan.id === currentPlanId;
    const disabledTrial = plan.id === 'gratuito' && status.teste_gratis_usado && currentPlanId !== 'gratuito';
    return `
      <article class="account-plan-card${selected ? ' selected' : ''}${disabledTrial ? ' disabled' : ''}">
        <header>
          <div>
            <h3>${esc(plan.nome)}</h3>
            <div class="account-plan-price">${esc(formatPlanPrice(plan))}</div>
          </div>
          ${selected ? '<span class="account-plan-chip">Atual</span>' : ''}
          ${disabledTrial ? '<span class="account-plan-chip">Ja usado</span>' : ''}
        </header>
        <p>${esc(plan.description || '')}</p>
        <ul>${(plan.recursos || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>
      </article>
    `;
  }).join('');

  const subscribeAction = document.getElementById('accountSubscribeAction');
  const manageAction = document.getElementById('accountManageAction');
  subscribeAction.textContent = isPending ? 'Tentar novamente' : (estado === 'expirado' || estado === 'vencido' || estado === 'bloqueado' ? 'Escolher plano' : 'Assinar agora');
  subscribeAction.style.display = isActive ? 'none' : '';
  manageAction.style.display = isActive ? '' : 'none';
}

function openAccountPanel() {
  renderAccountPanel();
  const modal = document.getElementById('accountModal');
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAccountPanel() {
  const modal = document.getElementById('accountModal');
  if (!modal) return;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

function logoutUser() {
  clearAuthStorage();
  window.location.href = '../auth/login/index.html';
}

function showSubscriptionLock(payload = {}) {
  const lock = document.getElementById('subscriptionLock');
  const banner = document.getElementById('subscriptionBanner');
  const lockTitle = document.getElementById('subscriptionLockTitle');
  const lockText = document.getElementById('subscriptionLockText');
  if (banner) banner.style.display = 'none';
  if (lockTitle) {
    lockTitle.textContent = payload.estado === 'pendente_pagamento'
      ? 'Pagamento pendente'
      : 'Seu acesso expirou';
  }
  if (lockText) {
    lockText.textContent = payload.error || payload.mensagem || 'Para continuar usando o FluxMEI e acessar seus dados, escolha um plano.';
  }
  if (lock) lock.style.display = 'grid';
  if (payload.redirectTo && !window.location.pathname.startsWith('/checkout')) {
    // Keep the user on the current screen with the modal; the CTA handles navigation.
  }
}
function mapCliente(item) {
  const meta = parseMetaObservacao(item.observacao);
  return {
    id: item.id,
    nome: item.nome,
    tel: item.telefone,
    obs: meta.texto,
    servico: meta.servico || '',
    agendaTipo: meta.agenda_tipo || (meta.proximo_contato ? 'Retorno' : (meta.aniversario ? 'Data importante' : '')),
    agendaData: meta.agenda_data || meta.proximo_contato || meta.aniversario || '',
    agendaDescricao: meta.agenda_descricao || ''
  };
}

function parseMetaObservacao(value) {
  if (!value) return { texto: '' };
  try {
    const parsed = JSON.parse(value);
    if (parsed && parsed._fluxmei_meta === true) {
      return { texto: '', ...parsed };
    }
  } catch {
    // Legacy observations are plain text.
  }
  return { texto: String(value || '') };
}

function stringifyMetaObservacao(meta) {
  const clean = Object.fromEntries(
    Object.entries(meta).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
  return Object.keys(clean).length ? JSON.stringify({ _fluxmei_meta: true, ...clean }) : null;
}

function getMovClientLinks() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MOV_CLIENT_LINKS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setMovClientLink(movId, clienteId) {
  if (!movId) return;
  const links = getMovClientLinks();
  if (clienteId) {
    links[movId] = clienteId;
  } else {
    delete links[movId];
  }
  localStorage.setItem(MOV_CLIENT_LINKS_KEY, JSON.stringify(links));
}

function shouldRetryWithoutObservacao(error) {
  return /observacao|schema cache|column/i.test(error?.message || '');
}

async function saveMovimentacaoRequest(path, payload, method) {
  try {
    return await apiRequest(path, {
      method,
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (!payload.observacao || !shouldRetryWithoutObservacao(error)) throw error;
    const fallbackPayload = { ...payload };
    delete fallbackPayload.observacao;
    return apiRequest(path, {
      method,
      body: JSON.stringify(fallbackPayload)
    });
  }
}

function getClienteNome(clienteId) {
  return state.clientes.find((cliente) => cliente.id === clienteId)?.nome || '';
}

function getClienteStats(clienteId) {
  const movs = state.movimentacoes.filter((mov) => mov.clienteId === clienteId);
  const entradas = movs.filter((mov) => mov.tipo === 'entrada');
  const totalRecebido = entradas.reduce((sum, mov) => sum + mov.valor, 0);
  const ultimaMov = [...movs].sort((a, b) => b.data.localeCompare(a.data))[0] || null;
  return {
    movs,
    totalRecebido,
    quantidade: entradas.length,
    ticketMedio: entradas.length ? totalRecebido / entradas.length : 0,
    ultimaMov
  };
}

function hydrateConfig(profile, dasList) {
  const nextDas = [...(dasList || [])]
    .filter((item) => item.status !== 'pago')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0];

  state.config = {
    nome: profile?.nome_negocio || profile?.nome || '',
    cpf: profile?.cpf || '',
    cnpj: profile?.cnpj || '',
    ramo: profile?.ramo || profile?.tipo_negocio || '',
    dasDia: nextDas?.vencimento ? Number(nextDas.vencimento.split('-')[2]) : '',
    dasValor: nextDas?.valor ? String(Number(nextDas.valor).toFixed(2)).replace('.', ',') : ''
  };
}

async function loadState() {
  const [me, assinaturaStatus] = await Promise.all([
    apiRequest('/auth/me'),
    apiRequest('/assinaturas/status')
  ]);

  state.user = me.user;
  renderSubscriptionNotice(assinaturaStatus);
  await loadAvailablePlans();

  if (assinaturaStatus?.bloqueado) {
    state.profile = me.profile;
    hydrateConfig(me.profile, []);
    return;
  }

  const [movimentacoes, clientes, das] = await Promise.all([
    apiRequest('/movimentacoes'),
    apiRequest('/clientes'),
    apiRequest('/das')
  ]);

  state.profile = me.profile;
  state.movimentacoes = (movimentacoes || []).map(mapMovimentacao);
  state.clientes = (clientes || []).map(mapCliente);
  state.das = das || [];
  hydrateConfig(me.profile, das || []);
}

async function reloadAndRender(page = currentPage) {
  await loadState();
  renderPage(page);
  updateSidebarUser();
}

function fmtDate(ano, mes, dia) {
  const m = ((mes % 12) + 12) % 12;
  const a = mes < 0 ? ano - 1 : (mes >= 12 ? ano + 1 : ano);
  const d = String(dia).padStart(2,'0');
  const mm = String(m+1).padStart(2,'0');
  return `${a}-${mm}-${d}`;
}

// ===== NAVIGATION =====
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.bottom-item').forEach(n => n.classList.remove('active'));

  const pg = document.getElementById('page-' + page);
  if (pg) pg.classList.add('active');

  document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));

  closeMobileMenu();
  renderPage(page);
  window.scrollTo(0, 0);
}

function renderPage(page) {
  switch(page) {
    case 'dashboard':      renderDashboard(); break;
    case 'movimentacoes':  renderMovimentacoes(); break;
    case 'calendario':     renderCalendario(); break;
    case 'clientes':       renderClientesEnhanced(); break;
    case 'relatorios':     renderRelatorios(); break;
    case 'configuracoes':  renderConfiguracoes(); break;
  }
}

// ===== MOBILE MENU =====
function closeMobileMenu() {
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('mobileOverlay').classList.remove('active');
}

// ===== MODALS =====
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  if (id === 'modalMovimentacao') resetMovForm();
  if (id === 'modalCliente') resetClienteForm();
}

// ===== TOAST =====
function showToast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function confirmarAcao({ title, message, confirmText = 'Confirmar', danger = false }) {
  return new Promise((resolve) => {
    const modal = document.getElementById('modalConfirmacao');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const confirmBtn = document.getElementById('confirmAction');
    const cancelBtn = document.getElementById('confirmCancel');
    const closeBtn = document.getElementById('confirmClose');

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmBtn.textContent = confirmText;
    confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    const cleanup = (result) => {
      modal.classList.remove('open');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    closeBtn.onclick = () => cleanup(false);
    modal.onclick = (event) => {
      if (event.target === modal) cleanup(false);
    };
    modal.classList.add('open');
  });
}

// ===== FORMAT HELPERS =====
function formatBRL(val) {
  return new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(val);
}
function parseBRL(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(/\./g,'').replace(',','.')) || 0;
}
function formatDate(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
function maskValor(el) {
  let v = el.value.replace(/\D/g,'');
  if (!v) { el.value = ''; return; }
  v = (parseInt(v)/100).toFixed(2);
  el.value = v.replace('.',',').replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function maskTelefone(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 11);
  if (!digits) {
    el.value = '';
    return;
  }

  if (digits.length <= 2) {
    el.value = `(${digits}`;
  } else if (digits.length <= 6) {
    el.value = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  } else if (digits.length <= 10) {
    el.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  } else {
    el.value = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
}
function maskCPF(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) {
    el.value = digits;
  } else if (digits.length <= 6) {
    el.value = `${digits.slice(0, 3)}.${digits.slice(3)}`;
  } else if (digits.length <= 9) {
    el.value = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  } else {
    el.value = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
}
function maskCNPJ(el) {
  const digits = el.value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) {
    el.value = digits;
  } else if (digits.length <= 5) {
    el.value = `${digits.slice(0, 2)}.${digits.slice(2)}`;
  } else if (digits.length <= 8) {
    el.value = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  } else if (digits.length <= 12) {
    el.value = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  } else {
    el.value = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
}
function getDocumentoTipo() {
  const tipo = document.getElementById('cfgDocumentoTipo')?.value || 'cpf';
  return tipo === 'cnpj' ? 'cnpj' : 'cpf';
}
function updateDocumentoConfig() {
  const tipo = getDocumentoTipo();
  const input = document.getElementById('cfgDocumento');
  const label = document.getElementById('cfgDocumentoLabel');
  if (!input || !label) return;

  label.textContent = tipo.toUpperCase();
  input.placeholder = tipo === 'cpf' ? '000.000.000-00' : '00.000.000/0001-00';
  input.value = tipo === 'cpf' ? (state.config.cpf || '') : (state.config.cnpj || '');
}
function maskDocumentoConfig() {
  const input = document.getElementById('cfgDocumento');
  if (!input) return;
  if (getDocumentoTipo() === 'cpf') {
    maskCPF(input);
  } else {
    maskCNPJ(input);
  }
}

// ===== CURRENT MONTH FILTER =====
function getMesAtual() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}
function isAnoMes(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ''));
}
function getDashboardMes() {
  if (!isAnoMes(dashboardMes)) dashboardMes = getMesAtual();
  return dashboardMes;
}
function formatMesAno(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  return `${MESES[mes - 1]} de ${ano}`;
}
function syncDashboardMesInput() {
  const input = document.getElementById('dashboardMes');
  if (input && input.value !== getDashboardMes()) input.value = getDashboardMes();
}
function filtrarMes(movs, anoMes) {
  return movs.filter(m => m.data && m.data.startsWith(anoMes));
}

// ===== DASHBOARD =====
function renderDashboard() {
  const mesSelecionado = getDashboardMes();
  syncDashboardMesInput();
  const movMes = filtrarMes(state.movimentacoes, mesSelecionado);

  const entradas = movMes.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const saidas   = movMes.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  const lucro = entradas - saidas;
  const saldoTotal = state.movimentacoes.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0)
                   - state.movimentacoes.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);

  document.getElementById('dashSubtitle').textContent = formatMesAno(mesSelecionado);

  document.getElementById('kpiSaldo').textContent   = formatBRL(saldoTotal);
  document.getElementById('kpiEntradas').textContent = formatBRL(entradas);
  document.getElementById('kpiSaidas').textContent   = formatBRL(saidas);
  document.getElementById('kpiLucro').textContent    = formatBRL(lucro);

  document.getElementById('kpiSaldoTrend').textContent   = 'Saldo acumulado total';
  document.getElementById('kpiEntradasTrend').textContent = `${movMes.filter(m=>m.tipo==='entrada').length} lançamentos`;
  document.getElementById('kpiSaidasTrend').textContent   = `${movMes.filter(m=>m.tipo==='saida').length} lançamentos`;
  document.getElementById('kpiLucroLabel').textContent   = lucro >= 0 ? '✓ Positivo' : '✗ Negativo';
  document.getElementById('kpiLucro').style.color = lucro >= 0 ? 'var(--green)' : 'var(--red)';

  // DAS
  renderDASInfo();

  // Últimas 8 movimentações
  const ultimas = [...movMes]
    .sort((a,b) => b.data.localeCompare(a.data))
    .slice(0, 8);

  const list = document.getElementById('dashMovList');
  if (!ultimas.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma movimentação ainda.</div>';
  } else {
    list.innerHTML = ultimas.map(m => `
      <div class="mov-item">
        <div class="mov-item-left">
          <div class="mov-dot ${m.tipo}"></div>
          <div>
            <div class="mov-desc">${esc(m.desc)}</div>
            <div class="mov-date">${formatDate(m.data)} · ${esc(m.cat)}</div>
          </div>
        </div>
        <span class="mov-valor ${m.tipo}">${m.tipo==='entrada'?'+':'-'}${formatBRL(m.valor)}</span>
      </div>
    `).join('');
  }

  // Mini chart
  renderDashChart(mesSelecionado);
}

function renderDASInfo() {
  const badge = document.getElementById('dasBadge');
  const alert = document.getElementById('dasAlert');
  const nextDas = [...state.das]
    .filter((item) => item.status !== 'pago')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0];

  if (!nextDas) {
    document.getElementById('dasDate').textContent = 'Não configurado';
    document.getElementById('dasDays').textContent = 'Cadastre o próximo DAS em Configurações';
    badge.className = 'badge-das';
    badge.textContent = '';
    alert.style.display = 'none';
    return;
  }

  const venc = new Date(`${nextDas.vencimento}T00:00:00`);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diff = Math.ceil((venc - hoje) / (1000*60*60*24));
  const label = venc.toLocaleDateString('pt-BR', {day:'2-digit',month:'long'});

  document.getElementById('dasDate').textContent = formatBRL(Number(nextDas.valor || 0));
  document.getElementById('dasDays').textContent = `Vencimento: ${label}`;

  if (diff < 0) {
    badge.className = 'badge-das danger'; badge.textContent = 'Vencido!';
    alert.className = 'das-alert danger';
    alert.innerHTML = `⚠️ <strong>DAS vencido!</strong> Regularize o DAS de ${esc(nextDas.mes_referencia)}.`;
    alert.style.display = 'flex';
  } else if (diff <= 7) {
    badge.className = 'badge-das warning'; badge.textContent = `${diff} dias`;
    alert.className = 'das-alert warning';
    alert.innerHTML = `🔔 <strong>DAS vence em ${diff} dia(s)!</strong> Não esqueça de pagar.`;
    alert.style.display = 'flex';
  } else {
    badge.className = 'badge-das ok'; badge.textContent = `${diff} dias`;
    alert.style.display = 'none';
  }
}

function renderDashChart(anoMesFinal = getDashboardMes()) {
  const ctx = document.getElementById('dashChart').getContext('2d');
  const [ano, mes] = anoMesFinal.split('-').map(Number);
  const ref = new Date(ano, mes - 1, 1);
  const labels = [], dataE = [], dataS = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(ref.getFullYear(), ref.getMonth()-i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    labels.push(MESES_ABREV[d.getMonth()]);
    const movs = filtrarMes(state.movimentacoes, ym);
    dataE.push(movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0));
    dataS.push(movs.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0));
  }

  if (dashChart) dashChart.destroy();
  dashChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Entradas', data:dataE, backgroundColor:'rgba(10,159,90,.82)', borderRadius:6, barPercentage:.6 },
        { label:'Saídas',   data:dataS, backgroundColor:'rgba(220,63,58,.72)', borderRadius:6, barPercentage:.6 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:'top', labels:{font:{size:11},boxWidth:12} } },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:11}} },
        y: { grid:{color:'#d9e8df'}, ticks:{font:{size:11}, color:'#40574d', callback: v => 'R$'+v.toLocaleString('pt-BR')} }
      }
    }
  });
}

// ===== MOVIMENTAÇÕES =====
let movCurrentTipo = '';
let movCurrentCat  = '';
let movCurrentMes  = '';
let movCurrentText = '';

function renderMovimentacoes() {
  // Set default month filter
  if (!document.getElementById('filtroMes').value) {
    document.getElementById('filtroMes').value = getDashboardMes();
  }
  applyFilters();
}

function applyFilters() {
  movCurrentTipo = document.getElementById('filtroTipo').value;
  movCurrentCat  = document.getElementById('filtroCategoria').value;
  movCurrentMes  = document.getElementById('filtroMes').value;
  movCurrentText = document.getElementById('filtroTexto').value.toLowerCase();

  let movs = [...state.movimentacoes];
  if (movCurrentTipo) movs = movs.filter(m => m.tipo === movCurrentTipo);
  if (movCurrentCat)  movs = movs.filter(m => m.cat  === movCurrentCat);
  if (movCurrentMes)  movs = movs.filter(m => m.data && m.data.startsWith(movCurrentMes));
  if (movCurrentText) movs = movs.filter(m => m.desc.toLowerCase().includes(movCurrentText) || (m.obs||'').toLowerCase().includes(movCurrentText));

  movs.sort((a,b) => b.data.localeCompare(a.data));

  // Summary
  const ent = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const sai = movs.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  document.getElementById('sumEntrada').textContent = formatBRL(ent);
  document.getElementById('sumSaida').textContent   = formatBRL(sai);
  document.getElementById('sumSaldo').textContent   = formatBRL(ent-sai);

  const tbody = document.getElementById('movTableBody');
  const empty = document.getElementById('movEmpty');

  if (!movs.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m => `
    <tr>
      <td>${formatDate(m.data)}</td>
      <td>
        <div style="font-weight:500">${esc(m.desc)}</div>
        ${m.clienteId ? `<div style="font-size:.75rem;color:var(--primary)">Cliente: ${esc(getClienteNome(m.clienteId))}</div>` : ''}
        ${m.obs ? `<div style="font-size:.75rem;color:var(--text-muted)">${esc(m.obs)}</div>` : ''}
      </td>
      <td><span class="badge-cat">${esc(m.cat)}</span></td>
      <td style="text-transform:capitalize">${pagIcon(m.pag)} ${m.pag||'—'}</td>
      <td><span class="badge-tipo ${m.tipo}">${m.tipo==='entrada'?'↑ Entrada':'↓ Saída'}</span></td>
      <td style="font-weight:700;color:${m.tipo==='entrada'?'var(--green)':'var(--red)'}">
        ${m.tipo==='entrada'?'+':'-'}${formatBRL(m.valor)}
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-action" onclick="editarMov('${m.id}')">✏️ Editar</button>
          <button class="btn-action delete" onclick="excluirMov('${m.id}')">🗑️ Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');

  // Update cat filter options
  const catSelect = document.getElementById('filtroCategoria');
  const curCat = catSelect.value;
  const cats = [...new Set(state.movimentacoes.map(m=>m.cat))].sort();
  catSelect.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c=>`<option value="${esc(c)}" ${c===curCat?'selected':''}>${esc(c)}</option>`).join('');
}

function pagIcon(pag) {
  const icons = { pix:'⚡', dinheiro:'💵', cartao:'💳', boleto:'📄' };
  return icons[pag] || '';
}

// ===== MOVIMENTACAO FORM =====
function setTipo(tipo) {
  movTipo = tipo;
  document.getElementById('btnEntrada').classList.toggle('active', tipo==='entrada');
  document.getElementById('btnSaida').classList.toggle('active', tipo==='saida');
  updateCategorias();
}

function updateCategorias() {
  const sel = document.getElementById('movCategoria');
  const current = sel.value;
  const cats = getCategoriasPorTipo(movTipo);
  sel.innerHTML = cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
  if (current && cats.includes(current)) sel.value = current;
}

function criarCategoria() {
  const input = document.getElementById('novaCategoria');
  const nome = normalizeCategoryName(input.value);
  if (!nome) {
    showToast('Digite o nome da categoria.', 'error');
    return;
  }

  const categories = getCustomCategories();
  const categoriaExistente = getCategoriasPorTipo(movTipo)
    .find((cat) => cat.toLowerCase() === nome.toLowerCase());
  const categoriaFinal = categoriaExistente || nome;

  if (!categoriaExistente) {
    categories[movTipo] = sortCategories([...(categories[movTipo] || []), nome]);
    saveCustomCategories(categories);
  }

  updateCategorias();
  document.getElementById('movCategoria').value = categoriaFinal;
  input.value = '';
  showToast(categoriaExistente ? 'Categoria selecionada!' : 'Categoria criada!');
}

function resetMovForm() {
  editingMovId = null;
  document.getElementById('movId').value = '';
  document.getElementById('movDesc').value = '';
  document.getElementById('movValor').value = '';
  document.getElementById('movObs').value = '';
  document.getElementById('movNovoClienteNome').value = '';
  document.getElementById('movNovoClienteTel').value = '';
  updateMovClienteOptions();
  document.getElementById('movCliente').value = '';
  const novaCategoriaInput = document.getElementById('novaCategoria');
  if (novaCategoriaInput) novaCategoriaInput.value = '';
  document.getElementById('movData').value = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="pagamento"][value="pix"]').checked = true;
  document.getElementById('modalMovTitle').textContent = 'Nova Movimentação';
  setTipo('entrada');
}

function openNovaMovimentacao(date, clienteId = '') {
  resetMovForm();
  if (clienteId) document.getElementById('movCliente').value = clienteId;
  if (date) {
    document.getElementById('movData').value = date;
  } else {
    const [ano, mes] = getDashboardMes().split('-').map(Number);
    const hoje = new Date();
    const dia = getDashboardMes() === getMesAtual()
      ? hoje.getDate()
      : Math.min(hoje.getDate(), new Date(ano, mes, 0).getDate());
    document.getElementById('movData').value = fmtDate(ano, mes - 1, dia);
  }
  openModal('modalMovimentacao');
}

function editarMov(id) {
  const m = state.movimentacoes.find(x=>x.id===id);
  if (!m) return;
  editingMovId = id;
  document.getElementById('modalMovTitle').textContent = 'Editar Movimentação';
  document.getElementById('movId').value = id;
  setTipo(m.tipo);
  document.getElementById('movDesc').value  = m.desc;
  document.getElementById('movValor').value = String(m.valor.toFixed(2)).replace('.',',');
  document.getElementById('movObs').value   = m.obs || '';
  document.getElementById('movData').value  = m.data;
  updateMovClienteOptions();
  document.getElementById('movCliente').value = m.clienteId || '';
  const sel = document.getElementById('movCategoria');
  [...sel.options].forEach(o => { if(o.value===m.cat) o.selected=true; });
  const pagRadio = document.querySelector(`input[name="pagamento"][value="${m.pag}"]`);
  if (pagRadio) pagRadio.checked = true;
  openModal('modalMovimentacao');
}

async function excluirMov(id) {
  const confirmed = await confirmarAcao({
    title: 'Excluir movimentacao',
    message: 'Essa movimentacao sera removida do seu historico financeiro.',
    confirmText: 'Excluir',
    danger: true
  });
  if (!confirmed) return;
  try {
    await apiRequest(`/movimentacoes/${id}`, { method: 'DELETE' });
    setMovClientLink(id, '');
    showToast('Movimentação excluída.', 'error');
    await reloadAndRender(currentPage);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function salvarMovimentacao() {
  const desc  = document.getElementById('movDesc').value.trim();
  const valor = parseBRL(document.getElementById('movValor').value);
  const cat   = document.getElementById('movCategoria').value;
  const data  = document.getElementById('movData').value;
  const pag   = document.querySelector('input[name="pagamento"]:checked').value;
  const obs   = document.getElementById('movObs').value.trim();
  const clienteId = document.getElementById('movCliente').value;

  if (!desc) { showToast('Preencha a descrição.', 'error'); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor válido.', 'error'); return; }
  if (!data) { showToast('Informe a data.', 'error'); return; }

  const payload = {
    tipo: movTipo,
    descricao: desc,
    valor,
    categoria: cat,
    forma_pagamento: pag,
    data,
    observacao: stringifyMetaObservacao({ texto: obs, cliente_id: clienteId })
  };

  try {
    if (editingMovId) {
      await saveMovimentacaoRequest(`/movimentacoes/${editingMovId}`, payload, 'PUT');
      setMovClientLink(editingMovId, clienteId);
      showToast('Movimentação atualizada! ✅');
    } else {
      const savedMovimentacao = await saveMovimentacaoRequest('/movimentacoes', payload, 'POST');
      setMovClientLink(savedMovimentacao?.id, clienteId);
      showToast('Movimentação salva! ✅');
    }

    const movMesInput = document.getElementById('filtroMes');
    if (movMesInput) movMesInput.value = payload.data.slice(0, 7);
    dashboardMes = payload.data.slice(0, 7);
    localStorage.setItem(DASHBOARD_MONTH_KEY, dashboardMes);
    closeModal('modalMovimentacao');
    await reloadAndRender(currentPage);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateMovClienteOptions() {
  const select = document.getElementById('movCliente');
  if (!select) return;
  const current = select.value;
  const clientes = [...state.clientes].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  select.innerHTML = '<option value="">Sem cliente vinculado</option>' +
    clientes.map((cliente) => `<option value="${esc(cliente.id)}">${esc(cliente.nome)}</option>`).join('');
  if (current && clientes.some((cliente) => cliente.id === current)) select.value = current;
}

function novaMovimentacaoCliente(clienteId) {
  openNovaMovimentacao(null, clienteId);
}

async function criarClienteRapido() {
  const nome = document.getElementById('movNovoClienteNome').value.trim();
  const telefone = document.getElementById('movNovoClienteTel').value.trim();

  if (!nome) {
    showToast('Informe o nome do cliente.', 'error');
    return;
  }

  try {
    const cliente = await apiRequest('/clientes', {
      method: 'POST',
      body: JSON.stringify({
        nome,
        telefone,
        email: null,
        observacao: null
      })
    });

    state.clientes.unshift(mapCliente(cliente));
    updateMovClienteOptions();
    document.getElementById('movCliente').value = cliente.id;
    document.getElementById('movNovoClienteNome').value = '';
    document.getElementById('movNovoClienteTel').value = '';
    showToast('Cliente criado e vinculado!');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== CALENDÁRIO =====
function renderCalendario() {
  const ano = calendarDate.getFullYear();
  const mes = calendarDate.getMonth();

  document.getElementById('calMonthLabel').textContent = `${MESES[mes]} ${ano}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const primeiroDia = new Date(ano, mes, 1).getDay();
  const ultimoDia   = new Date(ano, mes+1, 0).getDate();
  const hoje = new Date();

  // Map dia → movimentações
  const movMap = {};
  const ym = `${ano}-${String(mes+1).padStart(2,'0')}`;
  filtrarMes(state.movimentacoes, ym).forEach(m => {
    const d = m.data.split('-')[2];
    if (!movMap[d]) movMap[d] = [];
    movMap[d].push(m);
  });

  // Dias do mês anterior (padding)
  const diasAnterior = new Date(ano, mes, 0).getDate();
  for (let i = primeiroDia - 1; i >= 0; i--) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    cell.innerHTML = `<span class="cal-day-num">${diasAnterior - i}</span>`;
    grid.appendChild(cell);
  }

  // Dias do mês
  for (let d = 1; d <= ultimoDia; d++) {
    const cell = document.createElement('div');
    const isToday = hoje.getDate()===d && hoje.getMonth()===mes && hoje.getFullYear()===ano;
    cell.className = 'cal-day' + (isToday ? ' today' : '');
    const dStr = String(d).padStart(2,'0');
    const movsDia = movMap[dStr] || [];
    const ent = movsDia.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
    const sai = movsDia.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
    const saldo = ent - sai;

    let html = `<span class="cal-day-num">${d}</span>`;
    if (ent > 0) html += `<span class="cal-value pos">+${formatBRL(ent)}</span>`;
    if (sai > 0) html += `<span class="cal-value neg">-${formatBRL(sai)}</span>`;
    if (movsDia.length > 0) {
      html += `<span class="cal-saldo">${saldo>=0?'':''}${formatBRL(saldo)}</span>`;
    }

    cell.innerHTML = html;
    const dateStr = `${ano}-${String(mes+1).padStart(2,'0')}-${dStr}`;
    cell.addEventListener('click', () => abrirDia(dateStr, movsDia));
    grid.appendChild(cell);
  }

  // Completar grid até múltiplo de 7
  const totalCells = primeiroDia + ultimoDia;
  const remaining  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day other-month';
    cell.innerHTML = `<span class="cal-day-num">${i}</span>`;
    grid.appendChild(cell);
  }
}

function abrirDia(dateStr, movs) {
  const title = `Movimentações — ${formatDate(dateStr)}`;
  document.getElementById('modalDiaTitle').textContent = title;

  const ent = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const sai = movs.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);

  let html = '';
  if (movs.length === 0) {
    html = '<div class="empty-state" style="padding:1.5rem">Nenhuma movimentação neste dia.<br><br><button class="btn btn-primary btn-sm" onclick="closeModal(\'modalDia\'); openNovaMovimentacao(\'' + dateStr + '\')">+ Adicionar</button></div>';
  } else {
    html += `<div class="dia-summary">
      <span>Entradas: <strong style="color:var(--green)">${formatBRL(ent)}</strong></span>
      <span>Saídas: <strong style="color:var(--red)">${formatBRL(sai)}</strong></span>
      <span>Saldo: <strong style="color:${ent-sai>=0?'var(--green)':'var(--red)'}">${formatBRL(ent-sai)}</strong></span>
    </div>`;
    html += movs.map(m => `
      <div class="dia-mov-item ${m.tipo}">
        <div>
          <div class="dia-mov-desc">${esc(m.desc)}</div>
          <div class="dia-mov-cat">${esc(m.cat)} · ${pagIcon(m.pag)} ${m.pag}</div>
        </div>
        <span class="dia-mov-val ${m.tipo}">${m.tipo==='entrada'?'+':'-'}${formatBRL(m.valor)}</span>
      </div>
    `).join('');
    html += `<div style="text-align:center;margin-top:1rem"><button class="btn btn-outline btn-sm" onclick="closeModal('modalDia'); openNovaMovimentacao('${dateStr}')">+ Adicionar neste dia</button></div>`;
  }
  document.getElementById('modalDiaBody').innerHTML = html;
  openModal('modalDia');
}

// ===== CLIENTES =====
function renderClientes() {
  const busca = (document.getElementById('buscaCliente').value||'').toLowerCase();
  let clientes = [...state.clientes];
  if (busca) clientes = clientes.filter(c => c.nome.toLowerCase().includes(busca) || (c.tel||'').toLowerCase().includes(busca));

  const grid = document.getElementById('clientesGrid');
  const empty = document.getElementById('clientesEmpty');

  if (!clientes.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = clientes.map(c => `
    <div class="cliente-card">
      <div class="cliente-header">
        <div class="cliente-nome">${esc(c.nome)}</div>
        <div class="action-btns">
          <button class="btn-action" onclick="editarCliente('${c.id}')">✏️</button>
          <button class="btn-action delete" onclick="excluirCliente('${c.id}')">🗑️</button>
        </div>
      </div>
      <div class="cliente-info">
        ${c.tel   ? `📱 <a href="https://wa.me/55${c.tel.replace(/\D/g,'')}" target="_blank">${esc(c.tel)}</a><br>` : ''}
        ${c.obs   ? `📝 ${esc(c.obs)}` : ''}
      </div>
    </div>
  `).join('');
}

function resetClienteForm() {
  editingClienteId = null;
  document.getElementById('clienteId').value   = '';
  document.getElementById('clienteNome').value  = '';
  document.getElementById('clienteTel').value   = '';
  document.getElementById('clienteServico').value = '';
  document.getElementById('clienteAgendaTipo').value = '';
  document.getElementById('clienteAgendaData').value = '';
  document.getElementById('clienteAgendaDescricao').value = '';
  document.getElementById('clienteObs').value   = '';
  document.getElementById('modalClienteTitle').textContent = 'Novo Cliente';
}

function editarCliente(id) {
  const c = state.clientes.find(x=>x.id===id);
  if (!c) return;
  editingClienteId = id;
  document.getElementById('modalClienteTitle').textContent = 'Editar Cliente';
  document.getElementById('clienteId').value   = id;
  document.getElementById('clienteNome').value  = c.nome;
  document.getElementById('clienteTel').value   = c.tel || '';
  document.getElementById('clienteServico').value = c.servico || '';
  document.getElementById('clienteAgendaTipo').value = c.agendaTipo || '';
  document.getElementById('clienteAgendaData').value = c.agendaData || '';
  document.getElementById('clienteAgendaDescricao').value = c.agendaDescricao || '';
  document.getElementById('clienteObs').value   = c.obs || '';
  openModal('modalCliente');
}

async function excluirCliente(id) {
  const confirmed = await confirmarAcao({
    title: 'Excluir cliente',
    message: 'O cadastro sera removido, mas as movimentacoes ja criadas continuam no financeiro.',
    confirmText: 'Excluir',
    danger: true
  });
  if (!confirmed) return;
  try {
    await apiRequest(`/clientes/${id}`, { method: 'DELETE' });
    showToast('Cliente excluído.', 'error');
    await reloadAndRender('clientes');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function salvarCliente() {
  const nome  = document.getElementById('clienteNome').value.trim();
  const tel   = document.getElementById('clienteTel').value.trim();
  const servico = document.getElementById('clienteServico').value.trim();
  const agendaTipo = document.getElementById('clienteAgendaTipo').value;
  const agendaData = document.getElementById('clienteAgendaData').value;
  const agendaDescricao = document.getElementById('clienteAgendaDescricao').value.trim();
  const obs   = document.getElementById('clienteObs').value.trim();

  if (!nome) { showToast('Informe o nome do cliente.', 'error'); return; }

  const payload = {
    nome,
    telefone: tel,
    email: null,
    observacao: stringifyMetaObservacao({
      texto: obs,
      servico,
      agenda_tipo: agendaTipo,
      agenda_data: agendaData,
      agenda_descricao: agendaDescricao
    })
  };

  try {
    if (editingClienteId) {
      await apiRequest(`/clientes/${editingClienteId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Cliente atualizado! ✅');
    } else {
      await apiRequest('/clientes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Cliente salvo! ✅');
    }

    closeModal('modalCliente');
    await reloadAndRender('clientes');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ===== RELATÓRIOS =====
function renderClientesEnhanced() {
  renderClientesAgenda();

  const busca = (document.getElementById('buscaCliente').value || '').toLowerCase();
  const ordenacao = document.getElementById('ordemClientes')?.value || 'nome';
  let clientes = [...state.clientes];

  if (busca) {
    clientes = clientes.filter((cliente) =>
      cliente.nome.toLowerCase().includes(busca) ||
      (cliente.tel || '').toLowerCase().includes(busca) ||
      (cliente.servico || '').toLowerCase().includes(busca)
    );
  }

  clientes.sort((a, b) => {
    const statsA = getClienteStats(a.id);
    const statsB = getClienteStats(b.id);
    if (ordenacao === 'faturamento') return statsB.totalRecebido - statsA.totalRecebido;
    if (ordenacao === 'ultimo') return String(statsB.ultimaMov?.data || '').localeCompare(String(statsA.ultimaMov?.data || ''));
    return a.nome.localeCompare(b.nome, 'pt-BR');
  });

  const grid = document.getElementById('clientesGrid');
  const empty = document.getElementById('clientesEmpty');

  if (!clientes.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = clientes.map((cliente) => {
    const stats = getClienteStats(cliente.id);
    const whatsapp = cliente.tel ? cliente.tel.replace(/\D/g, '') : '';
    const isLateContact = cliente.agendaData && cliente.agendaData < new Date().toISOString().slice(0, 10);
    return `
      <div class="cliente-card">
        <div class="cliente-header">
          <div>
            <div class="cliente-nome">${esc(cliente.nome)}</div>
            ${cliente.agendaTipo ? `<span class="cliente-agenda-badge">${esc(cliente.agendaTipo)}</span>` : ''}
          </div>
          <div class="action-btns">
            <button class="btn-action" onclick="editarCliente('${cliente.id}')">Editar</button>
            <button class="btn-action delete" onclick="excluirCliente('${cliente.id}')">Excluir</button>
          </div>
        </div>
        <div class="cliente-stats">
          <div><strong>${formatBRL(stats.totalRecebido)}</strong><span>Total recebido</span></div>
          <div><strong>${stats.quantidade}</strong><span>Vendas</span></div>
          <div><strong>${formatBRL(stats.ticketMedio)}</strong><span>Ticket medio</span></div>
        </div>
        <div class="cliente-info">
          ${cliente.servico ? `<div><strong>Servico:</strong> ${esc(cliente.servico)}</div>` : ''}
          ${stats.ultimaMov ? `<div><strong>Ultima movimentacao:</strong> ${formatDate(stats.ultimaMov.data)}</div>` : '<div><strong>Ultima movimentacao:</strong> nenhuma</div>'}
          ${cliente.agendaData ? `<div class="${isLateContact ? 'cliente-alert' : ''}"><strong>${esc(cliente.agendaTipo || 'Agenda')}:</strong> ${formatDate(cliente.agendaData)}</div>` : ''}
          ${cliente.agendaDescricao ? `<div><strong>Detalhe:</strong> ${esc(cliente.agendaDescricao)}</div>` : ''}
          ${cliente.obs ? `<div><strong>Observacoes:</strong> ${esc(cliente.obs)}</div>` : ''}
        </div>
        <div class="cliente-actions">
          ${whatsapp ? `<a class="btn btn-sm btn-outline" href="https://wa.me/55${whatsapp}" target="_blank">WhatsApp</a>` : ''}
          <button class="btn btn-sm btn-primary" type="button" onclick="novaMovimentacaoCliente('${cliente.id}')">+ Movimento</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderClientesAgenda() {
  const agenda = document.getElementById('clientesAgenda');
  if (!agenda) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = toISODate(today);
  const nextLimit = addDays(today, 14);

  const items = state.clientes
    .filter((cliente) => cliente.agendaData)
    .map((cliente) => ({
      cliente,
      tipo: cliente.agendaTipo || 'Agenda',
      data: cliente.agendaData,
      descricao: cliente.agendaDescricao || cliente.servico || 'Compromisso agendado'
    }))
    .sort((a, b) => a.data.localeCompare(b.data));

  const atrasados = items.filter((item) => item.data < todayIso);
  const hoje = items.filter((item) => item.data === todayIso);
  const proximos = items.filter((item) => {
    const date = new Date(`${item.data}T00:00:00`);
    return date > today && date <= nextLimit;
  });

  agenda.innerHTML = [
    renderAgendaColumn('Atrasados', atrasados, 'danger'),
    renderAgendaColumn('Hoje', hoje, 'today'),
    renderAgendaColumn('Proximos 14 dias', proximos, 'next')
  ].join('');
}

function renderAgendaColumn(title, items, tone) {
  return `
    <div class="agenda-column agenda-${tone}">
      <div class="agenda-column-header">
        <h3>${title}</h3>
        <span>${items.length}</span>
      </div>
      <div class="agenda-list">
        ${items.length ? items.map(renderAgendaItem).join('') : '<div class="agenda-empty">Nada agendado.</div>'}
      </div>
    </div>
  `;
}

function renderAgendaItem(item) {
  const whatsapp = item.cliente.tel ? item.cliente.tel.replace(/\D/g, '') : '';
  return `
    <div class="agenda-item">
      <div class="agenda-date">${formatDate(item.data)}</div>
      <div class="agenda-client">${esc(item.cliente.nome)}</div>
      <div class="agenda-meta">${esc(item.tipo)} · ${esc(item.descricao)}</div>
      <div class="agenda-actions">
        ${whatsapp ? `<a class="btn btn-sm btn-outline" href="https://wa.me/55${whatsapp}" target="_blank">WhatsApp</a>` : ''}
        <button class="btn btn-sm btn-outline" type="button" onclick="editarCliente('${item.cliente.id}')">Editar</button>
        <button class="btn btn-sm btn-primary" type="button" onclick="novaMovimentacaoCliente('${item.cliente.id}')">+ Movimento</button>
      </div>
    </div>
  `;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function toISODate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getRelatorioPeriodoConfig(tipo, ano) {
  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const ref = Number(ano) === anoAtual
    ? new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
    : new Date(Number(ano), 11, 31);

  if (tipo === 'bisemanal') {
    const inicio = addDays(ref, -14);
    const buckets = Array.from({ length: 15 }, (_, index) => {
      const date = addDays(inicio, index);
      return {
        key: toISODate(date),
        label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
      };
    });
    return {
      titulo: 'Relatorio bisemanal',
      resultadoLabel: 'Resultado Bisemanal',
      mediaLabel: 'Media Diaria',
      mediaDivisor: 15,
      chartLabel: 'Entradas x Saidas por dia',
      inicio: toISODate(inicio),
      fim: toISODate(ref),
      buckets,
      bucketKey: (mov) => mov.data
    };
  }

  if (tipo === 'mensal') {
    const inicio = new Date(ref.getFullYear(), ref.getMonth(), 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const totalDias = fim.getDate();
    const buckets = Array.from({ length: totalDias }, (_, index) => {
      const date = new Date(ref.getFullYear(), ref.getMonth(), index + 1);
      return {
        key: toISODate(date),
        label: String(index + 1).padStart(2, '0')
      };
    });
    return {
      titulo: 'Relatorio mensal',
      resultadoLabel: 'Resultado Mensal',
      mediaLabel: 'Media Diaria',
      mediaDivisor: totalDias,
      chartLabel: 'Entradas x Saidas por dia',
      inicio: toISODate(inicio),
      fim: toISODate(fim),
      buckets,
      bucketKey: (mov) => mov.data
    };
  }

  if (tipo === 'semestral') {
    const inicio = new Date(ref.getFullYear(), ref.getMonth() - 5, 1);
    const fim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
    const buckets = Array.from({ length: 6 }, (_, index) => {
      const date = addMonths(inicio, index);
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: MESES_ABREV[date.getMonth()]
      };
    });
    return {
      titulo: 'Relatorio semestral',
      resultadoLabel: 'Resultado Semestral',
      mediaLabel: 'Media Mensal',
      mediaDivisor: 6,
      chartLabel: 'Entradas x Saidas por mes',
      inicio: toISODate(inicio),
      fim: toISODate(fim),
      buckets,
      bucketKey: (mov) => mov.data.slice(0, 7)
    };
  }

  const inicio = new Date(Number(ano), 0, 1);
  const fim = new Date(Number(ano), 11, 31);
  return {
    titulo: 'Relatorio anual',
    resultadoLabel: 'Resultado Anual',
    mediaLabel: 'Media Mensal',
    mediaDivisor: 12,
    chartLabel: 'Entradas x Saidas por mes',
    inicio: toISODate(inicio),
    fim: toISODate(fim),
    buckets: MESES_ABREV.map((label, index) => ({
      key: `${ano}-${String(index + 1).padStart(2, '0')}`,
      label
    })),
    bucketKey: (mov) => mov.data.slice(0, 7)
  };
}

function renderRelatorios() {
  const anoSel = document.getElementById('relatorioAno');
  const periodoSel = document.getElementById('relatorioPeriodo');
  const anos = [...new Set([String(new Date().getFullYear()), ...state.movimentacoes.map(m=>m.data.split('-')[0])])].sort().reverse();
  const curAno = anoSel.value || String(new Date().getFullYear());
  if (!anoSel.innerHTML.includes(curAno)) {
    anoSel.innerHTML = anos.map(a=>`<option value="${a}" ${a===curAno?'selected':''}>${a}</option>`).join('');
  }
  anoSel.value = curAno;
  const periodoTipo = periodoSel?.value || 'anual';
  const periodo = getRelatorioPeriodoConfig(periodoTipo, curAno);
  const movPeriodo = state.movimentacoes.filter((mov) => mov.data >= periodo.inicio && mov.data <= periodo.fim);
  const totEntPeriodo = movPeriodo.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const totSaiPeriodo = movPeriodo.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  const lucroPeriodo = totEntPeriodo - totSaiPeriodo;
  const mediaPeriodo = lucroPeriodo / periodo.mediaDivisor;

  document.getElementById('relSummaryGrid').innerHTML = `
    <div class="kpi-card kpi-entrada">
      <div class="kpi-header"><span class="kpi-label">Total Entradas</span><span class="kpi-icon">↑</span></div>
      <div class="kpi-value">${formatBRL(totEntPeriodo)}</div>
    </div>
    <div class="kpi-card kpi-saida">
      <div class="kpi-header"><span class="kpi-label">Total Saidas</span><span class="kpi-icon">↓</span></div>
      <div class="kpi-value">${formatBRL(totSaiPeriodo)}</div>
    </div>
    <div class="kpi-card kpi-lucro">
      <div class="kpi-header"><span class="kpi-label">${periodo.resultadoLabel}</span><span class="kpi-icon">◆</span></div>
      <div class="kpi-value" style="color:${lucroPeriodo>=0?'var(--green)':'var(--red)'}">${formatBRL(lucroPeriodo)}</div>
    </div>
    <div class="kpi-card kpi-saldo">
      <div class="kpi-header"><span class="kpi-label">${periodo.mediaLabel}</span><span class="kpi-icon">◈</span></div>
      <div class="kpi-value">${formatBRL(mediaPeriodo)}</div>
    </div>
  `;

  const chartTitle = document.getElementById('relChartTitle');
  if (chartTitle) chartTitle.textContent = periodo.chartLabel;

  const valoresPorBucket = periodo.buckets.map((bucket) => {
    const movs = movPeriodo.filter((mov) => periodo.bucketKey(mov) === bucket.key);
    return {
      entradas: movs.filter(x=>x.tipo==='entrada').reduce((s,x)=>s+x.valor,0),
      saidas: movs.filter(x=>x.tipo==='saida').reduce((s,x)=>s+x.valor,0)
    };
  });

  const ctxPeriodo = document.getElementById('relChart').getContext('2d');
  if (relChart) relChart.destroy();
  relChart = new Chart(ctxPeriodo, {
    type: 'bar',
    data: {
      labels: periodo.buckets.map((bucket) => bucket.label),
      datasets: [
        { label:'Entradas', data:valoresPorBucket.map(item=>item.entradas), backgroundColor:'rgba(10,159,90,.82)', borderRadius:6, barPercentage:.65 },
        { label:'Saidas', data:valoresPorBucket.map(item=>item.saidas), backgroundColor:'rgba(220,63,58,.72)', borderRadius:6, barPercentage:.65 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top',labels:{font:{size:11},boxWidth:12}} },
      scales:{
        x:{grid:{display:false},ticks:{font:{size:11}}},
        y:{grid:{color:'#d9e8df'},ticks:{font:{size:11},color:'#40574d',callback:v=>'R$'+v.toLocaleString('pt-BR')}}
      }
    }
  });

  const despesasCatPeriodo = {};
  movPeriodo.filter(m=>m.tipo==='saida').forEach(m => {
    despesasCatPeriodo[m.cat] = (despesasCatPeriodo[m.cat]||0) + m.valor;
  });
  const topDespesasPeriodo = Object.entries(despesasCatPeriodo).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('relDespesas').innerHTML = topDespesasPeriodo.length
    ? topDespesasPeriodo.map(([cat,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${esc(cat)}</span>
          <span class="rank-val neg">${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem saidas registradas.</div>';

  const diasFatPeriodo = {};
  movPeriodo.filter(m=>m.tipo==='entrada').forEach(m => {
    diasFatPeriodo[m.data] = (diasFatPeriodo[m.data]||0) + m.valor;
  });
  const topDiasPeriodo = Object.entries(diasFatPeriodo).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('relMelhoresDias').innerHTML = topDiasPeriodo.length
    ? topDiasPeriodo.map(([data,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${formatDate(data)}</span>
          <span class="rank-val pos">${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem entradas registradas.</div>';

  const catsPeriodo = {};
  movPeriodo.forEach(m => { catsPeriodo[m.cat] = (catsPeriodo[m.cat]||0) + (m.tipo==='entrada'?m.valor:-m.valor); });
  const topCatsPeriodo = Object.entries(catsPeriodo).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('relCategorias').innerHTML = topCatsPeriodo.length
    ? topCatsPeriodo.map(([cat,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${esc(cat)}</span>
          <span class="rank-val ${val>=0?'pos':'neg'}">${val>=0?'+':''}${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem dados.</div>';

  return;

  const movAno = state.movimentacoes.filter(m=>m.data.startsWith(curAno));

  // Summary anual
  const totEnt = movAno.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const totSai = movAno.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  const lucroAno = totEnt - totSai;
  const mediaM   = lucroAno / 12;

  document.getElementById('relSummaryGrid').innerHTML = `
    <div class="kpi-card kpi-entrada">
      <div class="kpi-header"><span class="kpi-label">Total Entradas</span><span class="kpi-icon">↑</span></div>
      <div class="kpi-value">${formatBRL(totEnt)}</div>
    </div>
    <div class="kpi-card kpi-saida">
      <div class="kpi-header"><span class="kpi-label">Total Saídas</span><span class="kpi-icon">↓</span></div>
      <div class="kpi-value">${formatBRL(totSai)}</div>
    </div>
    <div class="kpi-card kpi-lucro">
      <div class="kpi-header"><span class="kpi-label">Resultado Anual</span><span class="kpi-icon">◆</span></div>
      <div class="kpi-value" style="color:${lucroAno>=0?'var(--green)':'var(--red)'}">${formatBRL(lucroAno)}</div>
    </div>
    <div class="kpi-card kpi-saldo">
      <div class="kpi-header"><span class="kpi-label">Média Mensal</span><span class="kpi-icon">◈</span></div>
      <div class="kpi-value">${formatBRL(mediaM)}</div>
    </div>
  `;

  // Gráfico mensal
  const labels = MESES_ABREV;
  const dataE = [], dataS = [];
  for (let m = 0; m < 12; m++) {
    const ym = `${curAno}-${String(m+1).padStart(2,'0')}`;
    const movs = filtrarMes(state.movimentacoes, ym);
    dataE.push(movs.filter(x=>x.tipo==='entrada').reduce((s,x)=>s+x.valor,0));
    dataS.push(movs.filter(x=>x.tipo==='saida').reduce((s,x)=>s+x.valor,0));
  }
  const ctx2 = document.getElementById('relChart').getContext('2d');
  if (relChart) relChart.destroy();
  relChart = new Chart(ctx2, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Entradas', data:dataE, backgroundColor:'rgba(10,159,90,.82)', borderRadius:6, barPercentage:.65 },
        { label:'Saídas',   data:dataS, backgroundColor:'rgba(220,63,58,.72)', borderRadius:6, barPercentage:.65 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top',labels:{font:{size:11},boxWidth:12}} },
      scales:{
        x:{grid:{display:false},ticks:{font:{size:11}}},
        y:{grid:{color:'#d9e8df'},ticks:{font:{size:11},color:'#40574d',callback:v=>'R$'+v.toLocaleString('pt-BR')}}
      }
    }
  });

  // Maiores despesas
  const despesasCat = {};
  movAno.filter(m=>m.tipo==='saida').forEach(m => {
    despesasCat[m.cat] = (despesasCat[m.cat]||0) + m.valor;
  });
  const topDespesas = Object.entries(despesasCat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('relDespesas').innerHTML = topDespesas.length
    ? topDespesas.map(([cat,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${esc(cat)}</span>
          <span class="rank-val neg">${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem saídas registradas.</div>';

  // Melhores dias
  const diasFat = {};
  movAno.filter(m=>m.tipo==='entrada').forEach(m => {
    diasFat[m.data] = (diasFat[m.data]||0) + m.valor;
  });
  const topDias = Object.entries(diasFat).sort((a,b)=>b[1]-a[1]).slice(0,6);
  document.getElementById('relMelhoresDias').innerHTML = topDias.length
    ? topDias.map(([data,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${formatDate(data)}</span>
          <span class="rank-val pos">${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem entradas registradas.</div>';

  // Categorias
  const cats = {};
  movAno.forEach(m => { cats[m.cat] = (cats[m.cat]||0) + (m.tipo==='entrada'?m.valor:-m.valor); });
  const topCats = Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('relCategorias').innerHTML = topCats.length
    ? topCats.map(([cat,val],i)=>`
        <div class="rank-item">
          <span class="rank-num">${i+1}</span>
          <span class="rank-label">${esc(cat)}</span>
          <span class="rank-val ${val>=0?'pos':'neg'}">${val>=0?'+':''}${formatBRL(val)}</span>
        </div>`).join('')
    : '<div class="empty-state" style="padding:1rem">Sem dados.</div>';
}

// ===== CONFIGURAÇÕES =====
function renderConfiguracoes() {
  document.getElementById('cfgNome').value     = state.config.nome || '';
  document.getElementById('cfgDocumentoTipo').value = state.config.cnpj ? 'cnpj' : 'cpf';
  updateDocumentoConfig();
  document.getElementById('cfgRamo').value     = state.config.ramo || '';
  document.getElementById('cfgDasDia').value   = state.config.dasDia || '';
  document.getElementById('cfgDasValor').value = state.config.dasValor || '';
  updateDasPreview();
  updateSidebarUser();
}

async function salvarConfig() {
  const documentoTipo = getDocumentoTipo();
  const documento = document.getElementById('cfgDocumento').value.trim();
  state.config.nome = document.getElementById('cfgNome').value.trim();
  state.config.cpf = documentoTipo === 'cpf' ? documento : '';
  state.config.cnpj = documentoTipo === 'cnpj' ? documento : '';
  state.config.ramo = document.getElementById('cfgRamo').value.trim();

  try {
    await apiRequest('/auth/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        nome: state.profile?.nome || state.config.nome || 'Usuário FluxMEI',
        nome_negocio: state.config.nome,
        cpf: state.config.cpf,
        cnpj: state.config.cnpj,
        ramo: state.config.ramo
      })
    });
    await reloadAndRender('configuracoes');
    showToast('Configurações salvas! ✅');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function salvarDAS() {
  const dia   = parseInt(document.getElementById('cfgDasDia').value);
  const valor = document.getElementById('cfgDasValor').value.trim();
  if (!dia || dia < 1 || dia > 31) { showToast('Dia inválido (1-31).', 'error'); return; }
  if (!parseBRL(valor) || parseBRL(valor) <= 0) { showToast('Informe o valor do DAS.', 'error'); return; }

  const now = new Date();
  const vencimento = new Date(now.getFullYear(), now.getMonth(), dia);
  if (vencimento < now) vencimento.setMonth(vencimento.getMonth() + 1);

  const mesReferencia = `${vencimento.getFullYear()}-${String(vencimento.getMonth()+1).padStart(2,'0')}`;
  const payload = {
    mes_referencia: mesReferencia,
    vencimento: `${mesReferencia}-${String(dia).padStart(2,'0')}`,
    valor: parseBRL(valor),
    status: 'pendente'
  };

  try {
    const existing = state.das.find((item) => item.mes_referencia === mesReferencia);
    if (existing) {
      await apiRequest(`/das/${existing.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await apiRequest('/das', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    await reloadAndRender('configuracoes');
    showToast('Lembrete do DAS configurado! ✅');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateDasPreview() {
  const dia = parseInt(document.getElementById('cfgDasDia').value);
  const prev = document.getElementById('dasPreview');

  if (!dia) {
    prev.className = 'das-preview';
    prev.textContent = '';
    return;
  }

  const hoje = new Date();
  let venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (venc < hoje) venc = new Date(hoje.getFullYear(), hoje.getMonth()+1, dia);
  const diff = Math.ceil((venc - hoje)/(1000*60*60*24));
  if (diff < 0) {
    prev.className='das-preview danger'; prev.textContent=`⚠️ DAS vencido! Regularize já.`;
  } else if (diff <= 7) {
    prev.className='das-preview warning'; prev.textContent=`⏰ DAS vence em ${diff} dia(s)!`;
  } else {
    prev.className='das-preview ok'; prev.textContent=`✅ DAS configurado. Vence em ${diff} dias.`;
  }
}

function updateSidebarUser() {
  const nome = state.config.nome || 'FluxMEI';
  document.querySelectorAll('.user-name').forEach(el=>el.textContent=nome);
  document.querySelectorAll('.user-avatar').forEach(el=>el.textContent=nome.charAt(0).toUpperCase());
  document.querySelectorAll('.user-plan').forEach(el=>el.textContent=getPlanLabel());
}

async function limparTudo() {
  const confirmed = await confirmarAcao({
    title: 'Apagar todos os dados',
    message: 'Isso remove movimentacoes, clientes e lembretes de DAS. Essa acao nao pode ser desfeita.',
    confirmText: 'Apagar tudo',
    danger: true
  });
  if (!confirmed) return;
  try {
    await Promise.all([
      ...state.movimentacoes.map((item) => apiRequest(`/movimentacoes/${item.id}`, { method: 'DELETE' })),
      ...state.clientes.map((item) => apiRequest(`/clientes/${item.id}`, { method: 'DELETE' })),
      ...state.das.map((item) => apiRequest(`/das/${item.id}`, { method: 'DELETE' }))
    ]);
    showToast('Todos os dados foram apagados.', 'error');
    await reloadAndRender(currentPage);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function exposeGlobalHandlers() {
  Object.assign(window, {
    navigate,
    openModal,
    closeModal,
    updateDocumentoConfig,
    toggleTheme,
    setTipo,
    openNovaMovimentacao,
    novaMovimentacaoCliente,
    editarMov,
    excluirMov,
    salvarMovimentacao,
    criarCategoria,
    criarClienteRapido,
    resetClienteForm,
    editarCliente,
    excluirCliente,
    salvarCliente,
    salvarConfig,
    salvarDAS,
    limparTudo
  });
}

// ===== ESCAPE =====
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== INIT =====
async function init() {
  setupThemeControls();

  try {
    await loadState();
  } catch (error) {
    showToast(error.message || 'Não foi possível carregar seus dados.', 'error');
    return;
  }

  // Navigation
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigate(el.dataset.page);
    });
  });

  // Hamburger
  document.getElementById('hamburger').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('mobile-open');
    document.getElementById('mobileOverlay').classList.toggle('active');
  });
  document.getElementById('mobileOverlay').addEventListener('click', closeMobileMenu);

  document.getElementById('accountMenuButton')?.addEventListener('click', openAccountPanel);
  document.getElementById('accountModalClose')?.addEventListener('click', closeAccountPanel);
  document.getElementById('accountModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'accountModal') closeAccountPanel();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAccountPanel();
  });

  // Modal backdrops close on outside click
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => {
      if (e.target === bd) closeModal(bd.id);
    });
  });

  // Valor mask
  document.getElementById('movValor').addEventListener('input', function(){ maskValor(this); });
  document.getElementById('clienteTel').addEventListener('input', function(){ maskTelefone(this); });
  document.getElementById('movNovoClienteTel').addEventListener('input', function(){ maskTelefone(this); });
  document.getElementById('cfgDocumento').addEventListener('input', maskDocumentoConfig);

  document.querySelectorAll('[data-open-movimentacao]').forEach((button) => {
    button.addEventListener('click', () => openNovaMovimentacao());
  });

  document.querySelectorAll('[data-open-account-settings]').forEach((button) => {
    button.addEventListener('click', () => {
      const lock = document.getElementById('subscriptionLock');
      if (lock) lock.style.display = 'none';
      navigate('configuracoes');
    });
  });

  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.addEventListener('click', logoutUser);
  });

  // Filters
  const dashboardMesInput = document.getElementById('dashboardMes');
  if (dashboardMesInput) {
    dashboardMes = getDashboardMes();
    dashboardMesInput.value = dashboardMes;
    dashboardMesInput.addEventListener('change', () => {
      dashboardMes = dashboardMesInput.value || getMesAtual();
      localStorage.setItem(DASHBOARD_MONTH_KEY, dashboardMes);
      renderDashboard();
    });
  }
  document.getElementById('filtroTipo').addEventListener('change', applyFilters);
  document.getElementById('filtroCategoria').addEventListener('change', applyFilters);
  document.getElementById('filtroMes').addEventListener('change', applyFilters);
  document.getElementById('filtroTexto').addEventListener('input', applyFilters);
  document.getElementById('buscaCliente').addEventListener('input', renderClientesEnhanced);
  document.getElementById('ordemClientes').addEventListener('change', renderClientesEnhanced);

  // Calendar nav
  document.getElementById('calPrev').addEventListener('click', () => {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()-1, 1);
    renderCalendario();
  });
  document.getElementById('calNext').addEventListener('click', () => {
    calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth()+1, 1);
    renderCalendario();
  });

  // Relatório ano
  document.getElementById('relatorioPeriodo').addEventListener('change', renderRelatorios);
  document.getElementById('relatorioAno').addEventListener('change', renderRelatorios);

  // Config DAS preview on input
  document.getElementById('cfgDasDia').addEventListener('input', updateDasPreview);

  // Set today as default date for new movements
  document.getElementById('movData').value = new Date().toISOString().split('T')[0];

  // Init categoria options
  updateCategorias();

  // Load filter month
  document.getElementById('filtroMes').value = getMesAtual();

  // Set rel ano options
  const relAno = document.getElementById('relatorioAno');
  const curY   = String(new Date().getFullYear());
  const anos   = [...new Set([curY, ...state.movimentacoes.map(m=>m.data.split('-')[0])])].sort().reverse();
  relAno.innerHTML = anos.map(a=>`<option value="${a}">${a}</option>`).join('');

  // Render initial page
  navigate('dashboard');
  updateSidebarUser();
}

document.addEventListener('DOMContentLoaded', init);
exposeGlobalHandlers();
