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
const DASHBOARD_PERIOD_KEY = 'fluxmei_dashboard_periodo';
const CUSTOM_CATEGORIES_KEY = 'fluxmei_custom_categories';
const MOV_CLIENT_LINKS_KEY = 'fluxmei_mov_client_links';
const FINANCIAL_GOALS_KEY = 'fluxmei_financial_goals';
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
const ONBOARDING_TOTAL_STEPS = 6;
const ONBOARDING_STEPS = [
  {
    title: '👋 Bem-vindo ao FluxMEI!',
    text: 'Vamos configurar sua conta em menos de 2 minutos.',
    button: 'Começar',
    visual: 'welcome'
  },
  {
    title: 'Cadastre sua primeira receita',
    text: 'Registre qualquer entrada de dinheiro para acompanhar o que entra no seu MEI.',
    button: 'Próximo',
    visual: 'revenue'
  },
  {
    title: 'Cadastre sua primeira despesa',
    text: 'Agora registre um gasto para acompanhar seu fluxo de caixa com clareza.',
    button: 'Próximo',
    visual: 'expense'
  },
  {
    title: 'Conheça o Dashboard',
    text: 'Veja saldo, receitas e despesas em uma visão simples para decidir melhor.',
    button: 'Próximo',
    visual: 'dashboard'
  },
  {
    title: 'Metas Financeiras',
    text: 'Crie metas para organizar reservas, investimentos e próximos passos do seu negócio.',
    button: 'Próximo',
    visual: 'goals'
  },
  {
    title: 'Tudo pronto!',
    text: 'Agora você já pode usar todos os recursos do FluxMEI.',
    button: 'Ir para Dashboard',
    visual: 'done'
  }
];

// ===== STATE =====
let state = {
  movimentacoes: [],
  clientes: [],
  das: [],
  paymentHistory: [],
  paymentHistoryError: '',
  referral: null,
  referralError: '',
  aiInsights: [],
  aiConversations: [],
  aiMessages: [],
  aiActiveConversationId: null,
  aiLoaded: false,
  aiLoading: false,
  metas: [],
  onboardingStep: 1,
  onboardingSaving: false,
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
let dashboardPeriodo = localStorage.getItem(DASHBOARD_PERIOD_KEY) || 'month';
let subscriptionStatus = null;

const APP_PAGES = new Set([
  'dashboard',
  'movimentacoes',
  'metas',
  'calendario',
  'clientes',
  'relatorios',
  'assistente',
  'configuracoes'
]);
const ROUTE_ALIASES = {
  inicio: 'dashboard',
  home: 'dashboard',
  lancar: 'movimentacoes',
  fluxia: 'assistente',
  ai: 'assistente',
  'assistente-financeiro': 'assistente',
  'minha-conta': 'account',
  conta: 'account',
  account: 'account',
  indique: 'referral',
  'indique-e-ganhe': 'referral',
  indicacao: 'referral',
  exportar: 'export',
  'exportar-dados': 'export',
  suporte: 'support'
};
const PAGE_HASHES = {
  dashboard: 'dashboard',
  movimentacoes: 'movimentacoes',
  metas: 'metas',
  calendario: 'calendario',
  clientes: 'clientes',
  relatorios: 'relatorios',
  assistente: 'fluxia',
  configuracoes: 'configuracoes',
  account: 'minha-conta',
  referral: 'indique-e-ganhe',
  export: 'exportar-dados'
};

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
function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function getToken() {
  return getAuthToken();
}

function clearAuthStorage() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('fluxmei_user');
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem('fluxmei_user');
}

function redirectToLogin() {
  window.location.href = '../auth/login/index.html';
}

async function notifyBackendLogout(token) {
  if (!token) return;

  for (const apiUrl of API_URLS) {
    try {
      const response = await fetch(`${apiUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });

      if (response.status === 404 && apiUrl !== API_URLS[API_URLS.length - 1]) continue;
      localStorage.setItem('fluxmei_api_url', apiUrl);
      return;
    } catch {
      // Logout local ainda deve acontecer mesmo sem resposta do backend.
    }
  }
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
    redirectToLogin();
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

function todayDownloadDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchExportBlob(path) {
  const token = getToken();
  if (!token) {
    redirectToLogin();
    throw new Error('Faça login para continuar.');
  }

  let response = null;
  let lastUrl = '';
  for (const apiUrl of API_URLS) {
    lastUrl = `${apiUrl}${path}`;
    try {
      response = await fetch(lastUrl, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.status === 404 && apiUrl !== API_URLS[API_URLS.length - 1]) continue;
      localStorage.setItem('fluxmei_api_url', apiUrl);
      break;
    } catch {
      response = null;
    }
  }

  if (!response) throw new Error('Nao foi possivel conectar a API.');
  if (response.status === 401) {
    clearAuthStorage();
    redirectToLogin();
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }
  if (!response.ok) {
    const message = response.headers.get('content-type')?.includes('application/json')
      ? (await response.json())?.message
      : await response.text();
    throw new Error(message || `Erro ao baixar exportacao em ${lastUrl}.`);
  }
  return response.blob();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

async function downloadExport(path, filename, button) {
  const originalText = button?.textContent || '';
  if (button) {
    button.disabled = true;
    button.textContent = 'Baixando...';
  }
  try {
    const blob = await fetchExportBlob(path);
    downloadBlob(blob, filename);
    showToast('Exportação iniciada.');
  } catch (error) {
    showToast(error.message || 'Nao foi possivel exportar seus dados agora.', 'error');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
}

function handleExportClick(type, button) {
  const date = todayDownloadDate();
  const options = {
    csv: {
      path: '/export/movimentacoes.csv',
      filename: `fluxmei-movimentacoes-${date}.csv`
    },
    json: {
      path: '/export/movimentacoes.json',
      filename: `fluxmei-movimentacoes-${date}.json`
    },
    resumo: {
      path: '/export/resumo.json',
      filename: `fluxmei-resumo-${date}.json`
    }
  };
  const selected = options[type];
  if (selected) downloadExport(selected.path, selected.filename, button);
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
  const topAlert = buildSmartAlerts(status, { includeActive: false })[0];

  if (topAlert) {
    banner.className = `subscription-banner ${topAlert.tone}${topAlert.urgent ? ' urgent' : ''}`;
    if (bannerTitle) bannerTitle.textContent = topAlert.title;
    if (bannerText) bannerText.textContent = topAlert.message;
    if (bannerAction) {
      bannerAction.textContent = topAlert.actionLabel;
      bannerAction.href = topAlert.href || '#';
      bannerAction.dataset.smartAlertAction = topAlert.action || '';
      bannerAction.dataset.smartAlertUrl = topAlert.href || '';
      bannerAction.style.display = topAlert.actionLabel ? '' : 'none';
    }
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }

  if (isBlocked) {
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

function getPlanShortLabel(planId) {
  if (planId === 'pro_anual' || planId === 'anual') return 'Anual';
  if (planId === 'pro_mensal' || planId === 'mensal') return 'Mensal';
  if (planId === 'gratuito') return 'Trial';
  return 'Plano';
}

function getPaymentPlanLabel(planId) {
  if (planId === 'pro_anual' || planId === 'anual') return 'Pro Anual';
  if (planId === 'pro_mensal' || planId === 'mensal') return 'Pro Mensal';
  if (planId === 'gratuito') return 'Trial';
  return planId ? String(planId) : '--';
}

function getPaymentMethodMeta(method) {
  const normalized = String(method || '').trim().toLowerCase();
  if (normalized === 'pix') return { label: 'Pix', icon: 'Pix' };
  if (normalized === 'boleto' || normalized === 'bank_slip') return { label: 'Boleto', icon: 'Bol' };
  if (normalized === 'cartao' || normalized === 'credit_card' || normalized === 'creditcard') return { label: 'Cartao', icon: 'Car' };
  return { label: method ? String(method) : '--', icon: 'Pay' };
}

function getPaymentStatusMeta(status) {
  const normalized = String(status || '').trim().toLowerCase();
  if (['received', 'confirmed', 'paid', 'pago', 'concluida', 'settled'].includes(normalized)) return { label: 'Pago', className: 'paid' };
  if (['pending', 'awaiting_risk_analysis', 'ativa', 'waiting', 'new', 'processing', 'em_processamento'].includes(normalized)) return { label: 'Pendente', className: 'pending' };
  if (['overdue', 'expired', 'vencido'].includes(normalized)) return { label: 'Vencido', className: 'overdue' };
  if (['refunded', 'estornado'].includes(normalized)) return { label: 'Estornado', className: 'refunded' };
  if (['canceled', 'cancelled', 'deleted', 'deleted_payment'].includes(normalized)) return { label: 'Cancelado', className: 'canceled' };
  return { label: status ? String(status) : '--', className: 'pending' };
}

function isReceiptEligible(status) {
  return getPaymentStatusMeta(status).className === 'paid';
}

function getPendingPayment() {
  const payments = Array.isArray(state.paymentHistory) ? state.paymentHistory : [];
  return payments.find((payment) => getPaymentStatusMeta(payment.status).className === 'pending') || null;
}

function buildPaymentPendingAlert(payment) {
  const method = getPaymentMethodMeta(payment?.payment_method || payment?.method);
  const date = payment?.created_at || payment?.date ? formatDate(payment.created_at || payment.date) : '--';
  const value = payment?.valor != null ? formatBRL(Number(payment.valor || 0)) : '--';

  return {
    id: 'pagamento-pendente',
    tone: 'info',
    title: 'Existe um pagamento aguardando confirmação.',
    message: `Metodo: ${method.label}. Valor: ${value}. Data: ${date}.`,
    actionLabel: 'Ver pagamento',
    action: 'payment',
    href: payment?.link || ''
  };
}

function buildSmartAlerts(status = subscriptionStatus, options = {}) {
  const includeActive = options.includeActive !== false;
  const alerts = [];
  const estado = status?.estado || status?.status;
  const dias = Number(status?.dias_restantes || 0);
  const currentPlanId = getCurrentPlanId(status);
  const currentPlan = getPlanById(currentPlanId);
  const checkoutUrl = getCheckoutUrlForPlan(currentPlanId && currentPlanId !== 'gratuito' ? currentPlanId : 'pro_mensal');
  const pendingPayment = getPendingPayment();

  if (estado === 'expirado' || estado === 'vencido' || estado === 'bloqueado') {
    alerts.push({
      id: 'trial-expirado',
      tone: 'danger',
      title: 'Seu período de teste terminou.',
      message: 'Escolha um plano para continuar usando o FluxMEI sem interrupções.',
      actionLabel: 'Escolher plano',
      action: 'checkout',
      href: '/checkout/',
      urgent: true
    });
    return alerts;
  }

  if (status?.cancel_at_period_end || estado === 'cancelamento_agendado') {
    alerts.push({
      id: 'cancelamento-agendado',
      tone: 'warning',
      title: 'Cancelamento agendado',
      message: `Sua assinatura será encerrada em ${status?.data_vencimento ? formatDate(status.data_vencimento) : 'fim do ciclo atual'}.`,
      actionLabel: 'Reativar assinatura',
      action: 'reactivate',
      href: '#'
    });
  }

  if (pendingPayment || ['pendente_pagamento', 'pendente'].includes(estado)) {
    alerts.push(buildPaymentPendingAlert(pendingPayment || {
      method: status?.ultimo_pagamento_metodo,
      valor: currentPlan?.preco,
      date: status?.data_inicio
    }));
  }

  if (estado === 'teste_gratis') {
    if (dias <= 3) {
      alerts.push({
        id: 'trial-fim',
        tone: 'warning',
        title: 'Seu período gratuito termina em breve.',
        message: `Seu período gratuito termina em ${dias} dia(s).`,
        actionLabel: 'Assinar agora',
        action: 'checkout',
        href: '/checkout/?plan=pro_mensal',
        urgent: dias <= 1
      });
    }
    return alerts;
  }

  if (estado === 'ativo') {
    if (dias <= 7) {
      alerts.push({
        id: 'assinatura-vence',
        tone: dias <= 3 ? 'warning urgent' : 'warning',
        title: 'Assinatura vence em breve',
        message: `Seu plano vence em ${dias} dia(s). Evite interrupções renovando sua assinatura.`,
        actionLabel: 'Renovar agora',
        action: 'checkout',
        href: checkoutUrl,
        urgent: dias <= 3
      });
    } else if (includeActive) {
      alerts.push({
        id: 'assinatura-ativa',
        tone: 'success',
        title: 'Seu plano está ativo.',
        message: `${getPaymentPlanLabel(status?.plano)} · Vencimento: ${status?.data_vencimento ? formatDate(status.data_vencimento) : '--'} · Status: Ativo.`,
        actionLabel: 'Ver assinatura',
        action: 'account',
        href: '#'
      });
    }
  }

  return alerts;
}

function renderSmartAlerts(rootId, options = {}) {
  const root = document.getElementById(rootId);
  if (!root) return;

  const alerts = buildSmartAlerts(subscriptionStatus, options);
  if (!alerts.length) {
    root.innerHTML = '';
    root.hidden = true;
    return;
  }

  root.hidden = false;
  root.innerHTML = alerts.map((alert) => `
    <article class="smart-alert ${esc(alert.tone)}" data-alert-id="${esc(alert.id)}">
      <div class="smart-alert-body">
        <strong>${esc(alert.title)}</strong>
        <span>${esc(alert.message)}</span>
      </div>
      <div class="smart-alert-actions">
        ${alert.actionLabel ? `<button class="btn btn-sm ${alert.tone.includes('danger') ? 'btn-danger' : 'btn-primary'}" type="button" data-smart-alert-action="${esc(alert.action)}" data-smart-alert-url="${esc(alert.href || '')}">${esc(alert.actionLabel)}</button>` : ''}
        <button class="smart-alert-close" type="button" data-smart-alert-close aria-label="Fechar aviso">x</button>
      </div>
    </article>
  `).join('');
}

function getPlanById(planId) {
  return state.planos.find((plan) => plan.id === planId) || DEFAULT_ACCOUNT_PLANS.find((plan) => plan.id === planId) || null;
}

function getCheckoutUrlForPlan(planId) {
  return `/checkout/?plan=${encodeURIComponent(planId)}`;
}

function isAsaasPendingStatus(status) {
  return ['pending', 'awaiting_risk_analysis'].includes(String(status || '').trim().toLowerCase());
}

function getPendingPaymentPlan(status = subscriptionStatus) {
  if (!isAsaasPendingStatus(status?.provider_status)) return null;
  return status?.pending_payment_plan || null;
}

function getSwitchTargetPlanId(currentPlanId) {
  if (currentPlanId === 'pro_mensal' || currentPlanId === 'mensal') return 'pro_anual';
  if (currentPlanId === 'pro_anual' || currentPlanId === 'anual') return 'pro_mensal';
  return null;
}

async function confirmPlanSwitch(targetPlanId) {
  const targetPlan = getPlanById(targetPlanId);
  if (!targetPlan || !['pro_mensal', 'pro_anual'].includes(targetPlan.id)) return;

  const confirmed = await confirmarAcao({
    title: `Trocar para ${getPlanShortLabel(targetPlan.id)}`,
    message: 'Voce sera levado ao checkout para pagar o novo plano. A troca sera confirmada apos o pagamento.',
    confirmText: 'Ir para checkout'
  });

  if (!confirmed) return;
  window.location.href = getCheckoutUrlForPlan(targetPlan.id);
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

async function loadPaymentHistory() {
  try {
    const historico = await apiRequest('/pagamentos/historico');
    state.paymentHistory = Array.isArray(historico?.payments) ? historico.payments : [];
    state.paymentHistoryError = '';
  } catch {
    state.paymentHistory = [];
    state.paymentHistoryError = 'Nao foi possivel carregar o historico de pagamentos agora.';
  }
}

async function loadReferralSummary() {
  try {
    const response = await apiRequest('/referrals/me');
    state.referral = response?.referral || null;
    state.referralError = '';
  } catch (error) {
    state.referral = null;
    state.referralError = error.message || 'Nao foi possivel carregar seu link de indicacao.';
  }
}

function getAccountStatusMeta(status = subscriptionStatus) {
  const estado = status?.estado || status?.status || 'teste_gratis';
  const dias = Number(status?.dias_restantes || 0);

  if (estado === 'cancelamento_agendado') return { label: 'Cancelamento agendado', className: 'scheduled' };
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

function isSubscriptionEnded(status = subscriptionStatus) {
  const estado = status?.estado || status?.status;
  return Boolean(status?.cancel_at_period_end || ['cancelamento_agendado', 'cancelado', 'vencido', 'expirado', 'bloqueado'].includes(estado));
}

async function cancelSubscription() {
  const status = subscriptionStatus || {};
  const endDate = status.data_vencimento ? formatDate(status.data_vencimento) : 'fim do periodo atual';
  const confirmed = await confirmarAcao({
    title: 'Cancelar assinatura',
    message: `Voce continuara com acesso ate ${endDate}. O historico de pagamentos e os dados financeiros serao mantidos.`,
    confirmText: 'Agendar cancelamento',
    danger: true
  });

  if (!confirmed) return;

  try {
    const response = await apiRequest('/assinaturas/cancelar', { method: 'POST' });
    await reloadAndRender(currentPage);
    renderAccountPanel();
    showToast(response?.message || `Sua assinatura sera encerrada em ${endDate}.`);
  } catch (error) {
    showToast(error.message || 'Nao foi possivel cancelar a assinatura agora.', 'error');
  }
}

async function reactivateSubscription() {
  try {
    const response = await apiRequest('/assinaturas/reativar', { method: 'POST' });
    if (response?.action === 'checkout' && response.checkout_url) {
      window.location.href = response.checkout_url;
      return;
    }
    await reloadAndRender(currentPage);
    renderAccountPanel();
    showToast(response?.message || 'Sua assinatura foi reativada.');
  } catch (error) {
    showToast(error.message || 'Nao foi possivel reativar a assinatura agora.', 'error');
  }
}

function scrollToPaymentHistory() {
  const section = document.getElementById('accountPaymentHistorySection');
  if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyReferralLink() {
  const input = document.getElementById('accountReferralLink');
  const button = document.getElementById('accountReferralCopy');
  const link = input?.value || '';
  if (!link || state.referralError) return;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
    } else {
      input.select();
      document.execCommand('copy');
    }
    if (button) {
      button.textContent = 'Copiado';
      window.setTimeout(() => { button.textContent = 'Copiar link'; }, 1400);
    }
    showToast('Link de indicacao copiado.');
  } catch {
    showToast('Nao foi possivel copiar o link agora.', 'error');
  }
}

async function shareReferralLink() {
  const input = document.getElementById('accountReferralLink');
  const link = input?.value || '';
  if (!link || state.referralError) return;

  try {
    if (navigator.share) {
      await navigator.share({
        title: 'FluxMEI',
        text: 'Conheca o FluxMEI para organizar as financas do MEI.',
        url: link
      });
      return;
    }
    await copyReferralLink();
  } catch {
    showToast('Nao foi possivel compartilhar agora.', 'error');
  }
}

async function copyTextToClipboard(text, successMessage) {
  if (!text) return;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const temp = document.createElement('textarea');
      temp.value = text;
      temp.setAttribute('readonly', '');
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
    showToast(successMessage);
  } catch {
    showToast('Nao foi possivel copiar agora.', 'error');
  }
}

function handleSmartAlertClick(event) {
  const closeButton = event.target.closest('[data-smart-alert-close]');
  if (closeButton) {
    closeButton.closest('.smart-alert, .subscription-banner')?.remove();
    return;
  }

  const actionButton = event.target.closest('[data-smart-alert-action]');
  if (!actionButton) return;

  event.preventDefault();
  const action = actionButton.dataset.smartAlertAction;
  const url = actionButton.dataset.smartAlertUrl;

  if (action === 'checkout') {
    window.location.href = url || '/checkout/';
    return;
  }

  if (action === 'reactivate') {
    reactivateSubscription();
    return;
  }

  if (action === 'payment') {
    if (url) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    openAccountPanel();
    window.setTimeout(scrollToPaymentHistory, 120);
    return;
  }

  if (action === 'account') {
    openAccountPanel();
  }
}

function renderAccountPanel() {
  const nome = state.profile?.nome || state.config.nome || state.user?.user_metadata?.nome || 'Usuario FluxMEI';
  const email = state.user?.email || 'Email nao informado';
  const status = subscriptionStatus || {};
  const currentPlanId = getCurrentPlanId(status);
  const currentPlan = state.planos.find((plan) => plan.id === currentPlanId) || state.planos[0];
  const switchTargetPlanId = getSwitchTargetPlanId(currentPlanId);
  const switchTargetPlan = switchTargetPlanId ? getPlanById(switchTargetPlanId) : null;
  const pendingPaymentPlan = getPendingPaymentPlan(status);
  const statusMeta = getAccountStatusMeta(status);
  const estado = status.estado || status.status;
  const dias = Number(status.dias_restantes || 0);
  const isActive = estado === 'ativo' || estado === 'cancelamento_agendado';
  const isPending = estado === 'pendente_pagamento' || estado === 'pendente';
  const isScheduledCancel = Boolean(status.cancel_at_period_end) || estado === 'cancelamento_agendado';
  const canReactivate = isSubscriptionEnded(status);
  const lastPaymentMethod = getPaymentMethodMeta(status.ultimo_pagamento_metodo);

  document.getElementById('accountName').textContent = nome;
  document.getElementById('accountEmail').textContent = email;
  const createdAt = document.getElementById('accountCreatedAt');
  if (createdAt) createdAt.textContent = state.profile?.created_at || state.user?.created_at ? formatDate(state.profile?.created_at || state.user?.created_at) : '--';
  document.querySelectorAll('.account-avatar').forEach((avatar) => {
    avatar.textContent = nome.charAt(0).toUpperCase();
  });
  const currentPlanLabel = getPlanShortLabel(currentPlanId) || currentPlan?.nome || getPlanLabel(status);
  document.getElementById('accountCurrentPlan').textContent = currentPlanLabel;
  const mirrorPlan = document.getElementById('accountCurrentPlanMirror');
  if (mirrorPlan) mirrorPlan.textContent = currentPlanLabel;
  document.getElementById('accountCurrentValue').textContent = currentPlan ? formatPlanPrice(currentPlan) : '--';
  document.getElementById('accountNextDueDate').textContent = status.data_vencimento ? formatDate(status.data_vencimento) : '--';
  document.getElementById('accountDaysRemaining').textContent = status.dias_restantes != null ? `${Number(status.dias_restantes || 0)} dia(s)` : '--';
  document.getElementById('accountLastPaymentDate').textContent = status.ultimo_pagamento_em ? formatDate(status.ultimo_pagamento_em) : '--';
  document.getElementById('accountLastPaymentMethod').textContent = status.ultimo_pagamento_metodo ? lastPaymentMethod.label : '--';

  const badge = document.getElementById('accountStatusBadge');
  badge.textContent = statusMeta.label;
  badge.className = `account-status-badge ${statusMeta.className}`;
  const proBadge = document.getElementById('accountProBadge');
  if (proBadge) proBadge.hidden = !['pro_mensal', 'pro_anual', 'mensal', 'anual'].includes(currentPlanId);
  const indicator = document.getElementById('accountSubscriptionIndicator');
  if (indicator) indicator.className = `account-subscription-indicator ${statusMeta.className}`;

  const statusText = estado === 'cancelamento_agendado'
    ? `Voce continuara com acesso ate ${status.data_vencimento ? formatDate(status.data_vencimento) : 'o fim do periodo ja pago'}.`
    : (estado === 'ativo'
      ? 'Acesso completo habilitado.'
    : (status.mensagem || (estado === 'teste_gratis'
      ? `Faltam ${dias} dia(s) para o fim do teste.`
      : 'Acompanhe seu plano e assinatura por aqui.')));
  document.getElementById('accountStatusText').textContent = statusText;

  const billingNotice = document.getElementById('accountBillingNotice');
  if (billingNotice) {
    billingNotice.hidden = !isScheduledCancel;
    billingNotice.textContent = isScheduledCancel
      ? `Sua assinatura sera encerrada em ${status.data_vencimento ? formatDate(status.data_vencimento) : 'fim do ciclo atual'}.`
      : '';
  }

  const switchCard = document.getElementById('accountSwitchCard');
  const switchTitle = document.getElementById('accountSwitchTitle');
  const switchText = document.getElementById('accountSwitchText');
  const switchButton = document.getElementById('accountPlanSwitchAction');
  const pendingWarning = document.getElementById('accountPendingWarning');

  if (switchCard && switchTitle && switchText && switchButton) {
    if (switchTargetPlan) {
      switchCard.hidden = false;
      switchButton.hidden = false;
      switchButton.disabled = false;
      switchButton.dataset.targetPlan = switchTargetPlan.id;
      switchButton.textContent = `Trocar para ${getPlanShortLabel(switchTargetPlan.id)}`;
      switchTitle.textContent = `Trocar para ${getPlanShortLabel(switchTargetPlan.id)}`;
      switchText.textContent = switchTargetPlan.id === 'pro_anual'
        ? 'Economize no anual: R$ 478,80 por ano, equivalente a R$ 39,90 por mes.'
        : 'A troca para mensal sera aplicada no proximo vencimento ou apos um novo pagamento aprovado.';
    } else if (estado === 'teste_gratis' || currentPlanId === 'gratuito') {
      switchCard.hidden = false;
      switchButton.hidden = false;
      switchButton.disabled = false;
      switchButton.dataset.targetPlan = 'pro_mensal';
      switchButton.textContent = 'Escolher plano';
      switchTitle.textContent = 'Escolher assinatura';
      switchText.textContent = 'Escolha mensal ou anual no checkout. A assinatura sera confirmada somente apos pagamento aprovado.';
    } else {
      switchCard.hidden = true;
      switchButton.dataset.targetPlan = '';
    }

    if (pendingWarning) {
      if (pendingPaymentPlan && pendingPaymentPlan !== currentPlanId) {
        pendingWarning.hidden = false;
        pendingWarning.textContent = `Ha um pagamento pendente para ${getPlanShortLabel(pendingPaymentPlan)}. A troca sera aplicada somente apos a confirmacao do pagamento.`;
      } else {
        pendingWarning.hidden = true;
        pendingWarning.textContent = '';
      }
    }
  }

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
  const quickSwitch = document.getElementById('accountQuickSwitch');
  const quickHistory = document.getElementById('accountQuickHistory');
  const quickCheckout = document.getElementById('accountQuickCheckout');
  const cancelAction = document.getElementById('accountCancelAction');
  const reactivateAction = document.getElementById('accountReactivateAction');
  subscribeAction.textContent = isPending ? 'Tentar novamente' : (estado === 'expirado' || estado === 'vencido' || estado === 'bloqueado' ? 'Escolher plano' : 'Assinar agora');
  subscribeAction.style.display = isActive ? 'none' : '';
  manageAction.style.display = isActive ? '' : 'none';
  manageAction.href = switchTargetPlan ? getCheckoutUrlForPlan(switchTargetPlan.id) : '/checkout/';
  if (quickSwitch) {
    quickSwitch.hidden = !switchTargetPlan;
    quickSwitch.dataset.targetPlan = switchTargetPlan?.id || '';
  }
  if (quickHistory) quickHistory.hidden = false;
  if (quickCheckout) quickCheckout.href = switchTargetPlan ? getCheckoutUrlForPlan(switchTargetPlan.id) : '/checkout/';
  if (cancelAction) {
    cancelAction.hidden = !isActive || isScheduledCancel;
    cancelAction.disabled = !isActive || isScheduledCancel;
  }
  if (reactivateAction) {
    reactivateAction.hidden = !canReactivate;
  }
  renderSmartAlerts('accountSmartAlerts', { includeActive: true });
  renderReferralCard();
  renderPaymentHistory();
}

function getReferralInviteLink(code) {
  if (!code) return '';
  const url = new URL('/auth/register.html', window.location.origin);
  url.searchParams.set('ref', code);
  return url.href;
}

function renderReferralCard() {
  const codeEl = document.getElementById('accountReferralCode');
  const linkEl = document.getElementById('accountReferralLink');
  const copyButton = document.getElementById('accountReferralCopy');
  const countEl = document.getElementById('accountReferralCount');
  const daysEl = document.getElementById('accountReferralDays');
  if (!codeEl || !linkEl || !copyButton) return;

  const code = state.referral?.referral_code || '';
  const link = getReferralInviteLink(code);
  const stats = state.referral?.stats || {};
  const rewardedCount = Number(stats.rewarded || 0);
  const convertedCount = Number(stats.converted || 0);
  const pendingCount = Number(stats.pending || 0);
  const totalReferrals = rewardedCount + convertedCount + pendingCount;
  codeEl.textContent = code || '--';
  linkEl.value = state.referralError || link || 'Gerando seu link de indicacao...';
  copyButton.disabled = !link;
  if (countEl) countEl.textContent = String(totalReferrals);
  if (daysEl) daysEl.textContent = String(rewardedCount * Number(state.referral?.reward_days || 15));
}

function renderPaymentHistory() {
  const root = document.getElementById('accountPaymentHistory');
  if (!root) return;

  if (state.paymentHistoryError) {
    root.innerHTML = `<div class="account-history-state error">${esc(state.paymentHistoryError)}</div>`;
    return;
  }

  const payments = Array.isArray(state.paymentHistory) ? state.paymentHistory : [];
  if (!payments.length) {
    root.innerHTML = `
      <div class="account-history-state account-empty-illustrated">
        <svg viewBox="0 0 120 88" aria-hidden="true"><rect x="18" y="16" width="84" height="56" rx="14"/><path d="M34 38h52M34 52h32"/><circle cx="82" cy="52" r="7"/></svg>
        <strong>Nenhum pagamento encontrado ainda.</strong>
        <span>Quando houver pagamentos, eles aparecerão aqui com recibos e links úteis.</span>
      </div>`;
    return;
  }

  root.innerHTML = payments.map((payment) => {
    const method = getPaymentMethodMeta(payment.payment_method);
    const status = getPaymentStatusMeta(payment.status);
    const date = payment.paid_at || payment.created_at;
    const provider = payment.provider ? String(payment.provider).toUpperCase() : '--';
    const pixCode = payment.pix_copia_cola || payment.pix_code || payment.qr_code || payment.copia_cola || '';
    const isBoleto = String(payment.payment_method || '').toLowerCase().includes('boleto');
    const externalAction = payment.link
      ? `<a class="account-payment-action" href="${esc(payment.link)}" target="_blank" rel="noopener">${isBoleto ? 'Abrir boleto' : 'Abrir'}</a>`
      : '';
    const pixAction = pixCode
      ? `<button class="account-payment-action" type="button" data-copy-pix="${esc(pixCode)}">Copiar Pix</button>`
      : '';
    const receiptAction = isReceiptEligible(payment.status)
      ? `<button class="account-payment-action receipt-link" type="button" data-receipt-id="${esc(payment.id)}">Ver recibo</button>`
      : '';
    const action = externalAction || pixAction || receiptAction
      ? `<div class="account-payment-actions">${externalAction}${pixAction}${receiptAction}</div>`
      : '<span class="account-payment-action muted">--</span>';

    return `
      <article class="account-payment-item">
        <div class="account-payment-method">
          <span class="account-payment-icon">${esc(method.icon)}</span>
          <div>
            <strong>${esc(method.label)}</strong>
            <span>${esc(provider)}</span>
          </div>
        </div>
        <div><span>Data</span><strong>${date ? formatDate(date) : '--'}</strong></div>
        <div><span>Plano</span><strong>${esc(getPaymentPlanLabel(payment.plano))}</strong></div>
        <div><span>Valor</span><strong>${formatBRL(payment.valor || 0)}</strong></div>
        <div><span>Status</span><strong class="account-payment-status ${status.className}">${esc(status.label)}</strong></div>
        <div class="account-payment-action-cell"><span>Ação</span>${action}</div>
      </article>
    `;
  }).join('');
}

function receiptPlanLabel(planId) {
  if (planId === 'pro_anual') return 'Plano Pro Anual';
  if (planId === 'pro_mensal') return 'Plano Pro Mensal';
  return getPaymentPlanLabel(planId);
}

function renderReceipt(receipt) {
  const content = document.getElementById('receiptContent');
  if (!content) return;
  const method = getPaymentMethodMeta(receipt.method);
  const provider = receipt.provider ? String(receipt.provider).toUpperCase() : '--';

  content.innerHTML = `
    <section class="receipt-card">
      <div class="receipt-brand">FluxMEI</div>
      <h3>Recibo de pagamento</h3>
      <p>Este recibo confirma o pagamento da assinatura FluxMEI referente ao plano contratado.</p>
      <dl class="receipt-details">
        <div><dt>ID do pagamento</dt><dd>${esc(receipt.payment_id)}</dd></div>
        <div><dt>Data do pagamento</dt><dd>${receipt.paid_at ? formatDate(receipt.paid_at) : '--'}</dd></div>
        <div><dt>Plano</dt><dd>${esc(receiptPlanLabel(receipt.plano))}</dd></div>
        <div><dt>Metodo</dt><dd>${esc(method.label)}</dd></div>
        <div><dt>Valor</dt><dd>${formatBRL(receipt.valor || 0)}</dd></div>
        <div><dt>Status</dt><dd>Pago</dd></div>
        <div><dt>Provedor</dt><dd>${esc(provider)}</dd></div>
        <div><dt>Usuario/email</dt><dd>${esc(receipt.user_email || '--')}</dd></div>
      </dl>
    </section>
  `;
}

async function openPaymentReceipt(paymentId) {
  if (!paymentId) return;
  const modal = document.getElementById('modalRecibo');
  const content = document.getElementById('receiptContent');
  if (content) content.innerHTML = '<div class="receipt-loading">Carregando recibo...</div>';
  if (modal) modal.classList.add('open');

  try {
    const response = await apiRequest(`/pagamentos/${encodeURIComponent(paymentId)}/recibo`);
    renderReceipt(response.receipt);
  } catch (error) {
    if (content) {
      content.innerHTML = `<div class="account-history-state error">${esc(error.message || 'Nao foi possivel carregar o recibo agora.')}</div>`;
    }
  }
}

function closeReceiptModal() {
  closeModal('modalRecibo');
}

function printReceipt() {
  const content = document.getElementById('receiptContent');
  if (!content) return;
  const printWindow = window.open('', '_blank', 'noopener');
  if (!printWindow) {
    window.print();
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>Recibo de pagamento FluxMEI</title>
        <style>
          body { margin: 0; padding: 32px; font-family: Arial, sans-serif; color: #10231a; background: #fff; }
          .receipt-card { max-width: 720px; margin: 0 auto; border: 1px solid #d8eadf; border-radius: 12px; padding: 28px; }
          .receipt-brand { color: #087333; font-weight: 900; font-size: 15px; }
          h3 { margin: 10px 0 8px; font-size: 26px; }
          p { color: #334844; line-height: 1.5; }
          dl { display: grid; gap: 10px; margin-top: 20px; }
          dl div { display: flex; justify-content: space-between; gap: 20px; border-bottom: 1px solid #e5efe9; padding: 10px 0; }
          dt { color: #6f8780; font-weight: 700; }
          dd { margin: 0; font-weight: 800; text-align: right; }
        </style>
      </head>
      <body>${content.innerHTML}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
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

async function logoutUser() {
  const token = getAuthToken();

  try {
    await notifyBackendLogout(token);
  } catch {
    // Erros tecnicos de logout nao devem impedir limpeza local.
  } finally {
    clearAuthStorage();
    redirectToLogin();
  }
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
  await Promise.all([
    loadAvailablePlans(),
    loadPaymentHistory(),
    loadReferralSummary()
  ]);
  renderSubscriptionNotice(assinaturaStatus);

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
function normalizeRouteTarget(target) {
  const raw = String(target || '')
    .trim()
    .replace(/^#/, '')
    .replace(/^\/?app\/?#?/, '')
    .replace(/^\/+/, '')
    .toLowerCase();
  return ROUTE_ALIASES[raw] || raw || 'dashboard';
}

function getInitialRoute() {
  const hash = normalizeRouteTarget(window.location.hash || '');
  return hash || 'dashboard';
}

function syncHashForRoute(route, { replace = false } = {}) {
  if (!window.history) return;
  const hash = PAGE_HASHES[route] || route;
  if (!hash) return;
  const next = `#${hash}`;
  if (window.location.hash === next) return;
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](null, '', next);
}

function setActiveNavigation(page, action = '') {
  document.querySelectorAll('.nav-item, .bottom-item').forEach((n) => {
    n.classList.remove('active');
    n.removeAttribute('aria-current');
  });

  if (page) {
    document.querySelectorAll(`.nav-item[data-page="${page}"], .bottom-item[data-page="${page}"]`).forEach((el) => {
      el.classList.add('active');
      el.setAttribute('aria-current', 'page');
    });
  }

  if (action) {
    document.querySelectorAll(`.nav-item[data-sidebar-action="${action}"]`).forEach((el) => {
      el.classList.add('active');
      el.setAttribute('aria-current', 'page');
    });
  }
}

function navigate(page, options = {}) {
  const route = normalizeRouteTarget(page);
  if (['account', 'referral', 'export', 'payments', 'support'].includes(route)) {
    setActiveNavigation('', route === 'payments' ? 'account' : route);
    closeMobileMenu();
    if (options.updateHash !== false && route !== 'support') syncHashForRoute(route, { replace: options.replaceHash });
    handleSidebarAction(route);
    return;
  }

  page = APP_PAGES.has(route) ? route : 'dashboard';
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const pg = document.getElementById('page-' + page);
  if (pg) {
    pg.classList.add('active');
  } else {
    page = 'dashboard';
    currentPage = page;
    document.getElementById('page-dashboard')?.classList.add('active');
  }

  setActiveNavigation(page);

  closeAccountPanel();
  closeMobileMenu();
  renderPage(page);
  if (options.updateHash !== false) syncHashForRoute(page, { replace: options.replaceHash });
  if (options.scroll !== false) window.scrollTo(0, 0);
}

function renderPage(page) {
  switch(page) {
    case 'dashboard':      renderDashboard(); break;
    case 'movimentacoes':  renderMovimentacoes(); break;
    case 'calendario':     renderCalendario(); break;
    case 'clientes':       renderClientesEnhanced(); break;
    case 'metas':          renderMetas(); break;
    case 'relatorios':     renderRelatorios(); break;
    case 'assistente':     renderAiAssistant(); break;
    case 'configuracoes':  renderConfiguracoes(); break;
  }
}

// ===== MOBILE MENU =====
function setMobileMenuState(open) {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('mobileOverlay');
  const hamburger = document.getElementById('hamburger');
  if (sidebar) sidebar.classList.toggle('mobile-open', open);
  if (overlay) {
    overlay.classList.toggle('active', open);
    overlay.setAttribute('aria-hidden', open ? 'false' : 'true');
  }
  if (hamburger) hamburger.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function openMobileMenu() {
  setMobileMenuState(true);
}

function closeMobileMenu() {
  setMobileMenuState(false);
}

// ===== ONBOARDING =====
function clampOnboardingStep(step) {
  const value = Number(step || 1);
  if (!Number.isInteger(value)) return 1;
  return Math.min(Math.max(value, 1), ONBOARDING_TOTAL_STEPS);
}

function shouldShowOnboarding() {
  return state.profile && state.profile.onboarding_completed !== true;
}

function getOnboardingVisual(type) {
  const common = 'viewBox="0 0 180 130" fill="none" xmlns="http://www.w3.org/2000/svg"';
  const visuals = {
    welcome: `<svg ${common}><rect x="24" y="20" width="132" height="90" rx="22" fill="#E8FBEA"/><circle cx="90" cy="64" r="28" fill="#48D52F"/><path d="M76 66h28M90 52v28" stroke="#08351F" stroke-width="8" stroke-linecap="round"/></svg>`,
    revenue: `<svg ${common}><rect x="26" y="26" width="128" height="78" rx="18" fill="#ECFDF3"/><path d="M50 82l28-26 22 18 30-34" stroke="#10B981" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="132" cy="40" r="10" fill="#48D52F"/></svg>`,
    expense: `<svg ${common}><rect x="36" y="22" width="108" height="86" rx="18" fill="#FFF7E6"/><path d="M58 50h64M58 70h44M58 90h56" stroke="#875A06" stroke-width="7" stroke-linecap="round"/><circle cx="128" cy="32" r="14" fill="#F59E0B"/></svg>`,
    dashboard: `<svg ${common}><rect x="22" y="20" width="136" height="90" rx="18" fill="#EEF2FF"/><rect x="42" y="42" width="36" height="40" rx="8" fill="#48D52F"/><rect x="86" y="34" width="24" height="48" rx="8" fill="#6366F1"/><rect x="118" y="56" width="20" height="26" rx="8" fill="#10B981"/></svg>`,
    goals: `<svg ${common}><circle cx="90" cy="66" r="46" fill="#ECFDF3"/><circle cx="90" cy="66" r="28" stroke="#10B981" stroke-width="8"/><circle cx="90" cy="66" r="10" fill="#48D52F"/><path d="M120 36l24-12-10 26" stroke="#08351F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    done: `<svg ${common}><rect x="24" y="20" width="132" height="90" rx="24" fill="#E8FBEA"/><path d="M58 68l22 22 46-52" stroke="#10B981" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  };
  return visuals[type] || visuals.welcome;
}

function renderOnboardingStep() {
  const step = clampOnboardingStep(state.onboardingStep);
  const data = ONBOARDING_STEPS[step - 1];
  const progress = Math.round((step / ONBOARDING_TOTAL_STEPS) * 100);

  document.getElementById('onboardingProgressText').textContent = `Passo ${step} de ${ONBOARDING_TOTAL_STEPS}`;
  document.getElementById('onboardingProgressBar').style.width = `${progress}%`;
  document.getElementById('onboardingTitle').textContent = data.title;
  document.getElementById('onboardingText').textContent = data.text;
  document.getElementById('onboardingVisual').innerHTML = getOnboardingVisual(data.visual);
  document.getElementById('onboardingNext').textContent = data.button;
  document.getElementById('onboardingBack').hidden = step <= 1;
}

async function saveOnboardingProgress({ step = state.onboardingStep, completed = false } = {}) {
  state.onboardingSaving = true;
  try {
    const payload = completed
      ? { onboarding_completed: true, onboarding_step: ONBOARDING_TOTAL_STEPS }
      : { onboarding_completed: false, onboarding_step: clampOnboardingStep(step) };
    const response = await apiRequest('/auth/me/onboarding', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    state.profile = { ...(state.profile || {}), ...(response?.profile || payload) };
  } finally {
    state.onboardingSaving = false;
  }
}

async function openOnboarding() {
  if (!shouldShowOnboarding()) return;
  state.onboardingStep = clampOnboardingStep(state.profile.onboarding_step || 1);
  renderOnboardingStep();
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.hidden = false;
    modal.classList.add('active');
  }
  if (!state.profile.onboarding_step) {
    await saveOnboardingProgress({ step: state.onboardingStep, completed: false });
  }
}

async function closeOnboarding() {
  const modal = document.getElementById('onboardingModal');
  if (modal) {
    modal.classList.remove('active');
    modal.hidden = true;
  }
  if (shouldShowOnboarding()) {
    try {
      await saveOnboardingProgress({ step: state.onboardingStep, completed: false });
    } catch {
      // Progress can be retried on the next access.
    }
  }
}

async function nextOnboardingStep() {
  if (state.onboardingSaving) return;
  if (state.onboardingStep >= ONBOARDING_TOTAL_STEPS) {
    try {
      await saveOnboardingProgress({ completed: true });
      await closeOnboarding();
      showToast('Onboarding concluido. Bem-vindo ao FluxMEI!');
      navigate('dashboard');
    } catch (error) {
      showToast(error.message || 'Nao foi possivel concluir o onboarding agora.', 'error');
    }
    return;
  }

  state.onboardingStep = clampOnboardingStep(state.onboardingStep + 1);
  renderOnboardingStep();
  try {
    await saveOnboardingProgress({ step: state.onboardingStep, completed: false });
  } catch (error) {
    showToast(error.message || 'Nao foi possivel salvar o progresso agora.', 'error');
  }
}

async function previousOnboardingStep() {
  if (state.onboardingSaving || state.onboardingStep <= 1) return;
  state.onboardingStep = clampOnboardingStep(state.onboardingStep - 1);
  renderOnboardingStep();
  try {
    await saveOnboardingProgress({ step: state.onboardingStep, completed: false });
  } catch (error) {
    showToast(error.message || 'Nao foi possivel salvar o progresso agora.', 'error');
  }
}

// ===== MODALS =====
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.add('open');
}
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.classList.remove('open');
  if (id === 'modalMovimentacao') resetMovForm();
  if (id === 'modalCliente') resetClienteForm();
  if (id === 'modalMeta') resetMetaForm();
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
  const [y,m,d] = String(iso).slice(0, 10).split('-');
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
function getPreviousAnoMes(anoMes) {
  const [ano, mes] = anoMes.split('-').map(Number);
  const date = new Date(ano, mes - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getDashboardPeriodMonths(anoMesFinal = getDashboardMes(), period = dashboardPeriodo) {
  const [ano, mes] = anoMesFinal.split('-').map(Number);
  const end = new Date(ano, mes - 1, 1);
  const months = [];
  const count = period === '3m' ? 3 : period === '6m' ? 6 : 1;

  if (period === 'year') {
    for (let month = 0; month <= end.getMonth(); month += 1) {
      months.push(`${end.getFullYear()}-${String(month + 1).padStart(2, '0')}`);
    }
    return months;
  }

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(end.getFullYear(), end.getMonth() - index, 1);
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function getDashboardPeriodLabel(period = dashboardPeriodo) {
  if (period === '3m') return 'Ultimos 3 meses';
  if (period === '6m') return 'Ultimos 6 meses';
  if (period === 'year') return 'Este ano';
  return 'Este mes';
}

function calcTotals(movs = []) {
  const entradas = movs.filter((m) => m.tipo === 'entrada').reduce((sum, mov) => sum + mov.valor, 0);
  const saidas = movs.filter((m) => m.tipo === 'saida').reduce((sum, mov) => sum + mov.valor, 0);
  return { entradas, saidas, lucro: entradas - saidas };
}

function calcPercentChange(current, previous) {
  if (!previous && !current) return 0;
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function formatPercentChange(value) {
  const rounded = Math.abs(value) >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('pt-BR')}%`;
}

function getExpenseCategories(movs = []) {
  const categories = new Map();
  movs.filter((mov) => mov.tipo === 'saida').forEach((mov) => {
    categories.set(mov.cat, (categories.get(mov.cat) || 0) + mov.valor);
  });
  return [...categories.entries()]
    .map(([category, value]) => ({ category, value }))
    .sort((a, b) => b.value - a.value);
}

function renderDashboard() {
  const mesSelecionado = getDashboardMes();
  syncDashboardMesInput();
  const movMes = filtrarMes(state.movimentacoes, mesSelecionado);
  renderSmartAlerts('dashboardSmartAlerts', { includeActive: true });

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
function renderDashboardInsights({ movPeriodo, monthlyTotals, periodTotals, saidasChange }) {
  const root = document.getElementById('dashboardInsights');
  if (!root) return;
  const categories = getExpenseCategories(movPeriodo);
  const topCategory = categories[0];
  const insights = [
    {
      tone: saidasChange > 0 ? 'warning' : 'good',
      title: saidasChange > 0
        ? `Suas despesas aumentaram ${formatPercentChange(saidasChange)} em relação ao mês anterior.`
        : 'Suas despesas não aumentaram em relação ao mês anterior.'
    },
    {
      tone: 'info',
      title: topCategory ? `Sua maior categoria de gasto foi ${topCategory.category}.` : 'Nenhuma despesa registrada no período.'
    },
    {
      tone: monthlyTotals.lucro >= 0 ? 'good' : 'danger',
      title: monthlyTotals.lucro >= 0
        ? `Você teve lucro de ${formatBRL(monthlyTotals.lucro)} neste mês.`
        : `Você teve resultado negativo de ${formatBRL(Math.abs(monthlyTotals.lucro))} neste mês.`
    },
    {
      tone: periodTotals.lucro >= 0 ? 'good' : 'warning',
      title: periodTotals.lucro >= 0
        ? `Você está próximo da sua meta financeira. Resultado do período: ${formatBRL(periodTotals.lucro)}.`
        : 'Revise seus gastos para se aproximar da sua meta financeira.'
    }
  ];

  root.innerHTML = insights.map((insight) => `
    <article class="dashboard-insight ${insight.tone}">
      <span></span>
      <p>${esc(insight.title)}</p>
    </article>
  `).join('');
}

function getDashboardGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getDashboardUserName() {
  return state.profile?.nome
    || state.config?.nome
    || state.user?.user_metadata?.nome
    || 'FluxMEI';
}

function renderDashboardHero() {
  const greeting = document.getElementById('dashboardGreeting');
  const planBadge = document.getElementById('dashboardPlanBadge');
  const subscriptionStatusLabel = document.getElementById('dashboardSubscriptionStatus');

  if (greeting) greeting.textContent = `${getDashboardGreeting()}, ${getDashboardUserName()}`;
  if (planBadge) planBadge.textContent = getPlanLabel();

  if (subscriptionStatusLabel) {
    const estado = subscriptionStatus?.estado || subscriptionStatus?.status || 'ativo';
    const blocked = subscriptionStatus?.bloqueado || ['expirado', 'bloqueado', 'vencido'].includes(estado);
    subscriptionStatusLabel.textContent = blocked ? 'Acesso requer atenção' : 'Assinatura em dia';
    subscriptionStatusLabel.classList.toggle('warning', blocked);
  }
}

function renderDashboardFluxia({ movPeriodo, monthlyTotals, periodTotals }) {
  const root = document.getElementById('dashboardFluxiaInsight');
  if (!root) return;

  if (!state.movimentacoes.length) {
    root.textContent = 'Cadastre movimentações para receber análises inteligentes.';
    return;
  }

  const categories = getExpenseCategories(movPeriodo);
  const topCategory = categories[0];
  if (monthlyTotals.lucro < 0) {
    root.textContent = `Seu mês está negativo em ${formatBRL(Math.abs(monthlyTotals.lucro))}. A FluxIA pode ajudar a encontrar cortes rápidos.`;
    return;
  }
  if (topCategory) {
    root.textContent = `Maior gasto do período: ${topCategory.category}, com ${formatBRL(topCategory.value)}. Abra a FluxIA para ver oportunidades.`;
    return;
  }
  root.textContent = `Resultado positivo no período: ${formatBRL(periodTotals.lucro)}. Peça uma análise da FluxIA para planejar o próximo passo.`;
}

function buildMonthlyDashboardSeries(months) {
  let runningBalance = 0;
  const firstMonth = months[0] || getDashboardMes();
  state.movimentacoes
    .filter((mov) => mov.data && mov.data.slice(0, 7) < firstMonth)
    .forEach((mov) => { runningBalance += mov.tipo === 'entrada' ? mov.valor : -mov.valor; });

  return months.map((ym) => {
    const movs = filtrarMes(state.movimentacoes, ym);
    const totals = calcTotals(movs);
    runningBalance += totals.lucro;
    const [, month] = ym.split('-').map(Number);
    return { ym, label: MESES_ABREV[month - 1], ...totals, saldo: runningBalance };
  });
}

function renderRevenueExpenseChart(series) {
  const root = document.getElementById('revenueExpenseChart');
  if (!root) return;
  if (!series.some((item) => item.entradas || item.saidas)) {
    root.innerHTML = '<div class="chart-empty-state">Sem movimentações para comparar neste período.</div>';
    return;
  }
  const maxValue = Math.max(1, ...series.flatMap((item) => [item.entradas, item.saidas]));
  root.innerHTML = `
    <div class="bar-chart" data-chart="revenue-expense">
      ${series.map((item) => `
        <div class="bar-group">
          <div class="bar-pair" title="${esc(item.label)}">
            <span class="bar income" style="height:${Math.max(4, (item.entradas / maxValue) * 100)}%"></span>
            <span class="bar expense" style="height:${Math.max(4, (item.saidas / maxValue) * 100)}%"></span>
          </div>
          <strong>${esc(item.label)}</strong>
        </div>
      `).join('')}
    </div>
    <div class="chart-legend"><span class="income"></span>Receitas <span class="expense"></span>Despesas</div>
  `;
}

function renderBalanceEvolutionChart(series) {
  const root = document.getElementById('balanceEvolutionChart');
  if (!root) return;
  if (!series.some((item) => item.saldo)) {
    root.innerHTML = '<div class="chart-empty-state">O saldo aparecerá quando houver movimentações.</div>';
    return;
  }
  const values = series.map((item) => item.saldo);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const width = 320;
  const height = 150;
  const coords = series.map((item, index) => {
    const x = series.length === 1 ? width / 2 : (index / (series.length - 1)) * width;
    const y = height - (((item.saldo - min) / range) * (height - 20)) - 10;
    return { x, y, item };
  });
  const points = coords.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');

  root.innerHTML = `
    <svg class="line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Evolução do saldo">
      <polyline points="${points}" fill="none" stroke="var(--primary)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"></polyline>
      ${coords.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="5" fill="var(--primary-dark)"><title>${esc(point.item.label)}: ${esc(formatBRL(point.item.saldo))}</title></circle>`).join('')}
    </svg>
    <div class="chart-legend compact">${series.map((item) => `<span>${esc(item.label)}</span>`).join('')}</div>
  `;
}

function renderExpenseCategoryChart(movPeriodo) {
  const root = document.getElementById('expenseCategoryChart');
  if (!root) return;
  const categories = getExpenseCategories(movPeriodo).slice(0, 5);
  const max = Math.max(1, ...categories.map((item) => item.value));
  if (!categories.length) {
    root.innerHTML = '<div class="chart-empty-state">Sem despesas no período.</div>';
    return;
  }
  root.innerHTML = categories.map((item) => `
    <div class="category-row">
      <div><strong>${esc(item.category)}</strong><span>${esc(formatBRL(item.value))}</span></div>
      <div class="category-meter"><span style="width:${Math.max(8, (item.value / max) * 100)}%"></span></div>
    </div>
  `).join('');
}

function renderTopExpenses(movPeriodo) {
  const root = document.getElementById('topExpensesList');
  if (!root) return;
  const expenses = movPeriodo
    .filter((mov) => mov.tipo === 'saida')
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 5);
  if (!expenses.length) {
    root.innerHTML = '<div class="chart-empty-state">Sem despesas no período.</div>';
    return;
  }
  root.innerHTML = expenses.map((mov, index) => `
    <div class="top-expense-item">
      <span>${index + 1}</span>
      <div><strong>${esc(mov.desc)}</strong><small>${esc(mov.cat)} · ${formatDate(mov.data)}</small></div>
      <b>${formatBRL(mov.valor)}</b>
    </div>
  `).join('');
}

function renderDashboardCharts({ months, movPeriodo }) {
  const series = buildMonthlyDashboardSeries(months);
  const subtitle = document.getElementById('revenueExpenseSubtitle');
  if (subtitle) subtitle.textContent = getDashboardPeriodLabel(dashboardPeriodo);
  renderRevenueExpenseChart(series);
  renderBalanceEvolutionChart(series);
  renderExpenseCategoryChart(movPeriodo);
  renderTopExpenses(movPeriodo);
}

function renderDashboard() {
  const mesSelecionado = getDashboardMes();
  syncDashboardMesInput();
  const months = getDashboardPeriodMonths(mesSelecionado, dashboardPeriodo);
  const periodSet = new Set(months);
  const movPeriodo = state.movimentacoes.filter((mov) => mov.data && periodSet.has(mov.data.slice(0, 7)));
  const movMes = filtrarMes(state.movimentacoes, mesSelecionado);
  const previousTotals = calcTotals(filtrarMes(state.movimentacoes, getPreviousAnoMes(mesSelecionado)));
  const monthlyTotals = calcTotals(movMes);
  const periodTotals = calcTotals(movPeriodo);
  const saldoTotal = state.movimentacoes.reduce((sum, mov) => sum + (mov.tipo === 'entrada' ? mov.valor : -mov.valor), 0);

  renderDashboardHero();
  renderSmartAlerts('dashboardSmartAlerts', { includeActive: true });
  document.getElementById('dashSubtitle').textContent = `${formatMesAno(mesSelecionado)} · ${getDashboardPeriodLabel(dashboardPeriodo)}`;
  document.getElementById('dashboardEmptyState').hidden = state.movimentacoes.length > 0;
  document.getElementById('kpiSaldo').textContent = formatBRL(saldoTotal);
  document.getElementById('kpiEntradas').textContent = formatBRL(monthlyTotals.entradas);
  document.getElementById('kpiSaidas').textContent = formatBRL(monthlyTotals.saidas);
  document.getElementById('kpiLucro').textContent = formatBRL(monthlyTotals.lucro);

  const entradasChange = calcPercentChange(monthlyTotals.entradas, previousTotals.entradas);
  const saidasChange = calcPercentChange(monthlyTotals.saidas, previousTotals.saidas);
  const lucroChange = calcPercentChange(monthlyTotals.lucro, previousTotals.lucro);
  document.getElementById('kpiSaldoTrend').textContent = `${getDashboardPeriodLabel(dashboardPeriodo)}: ${formatBRL(periodTotals.lucro)} de resultado`;
  document.getElementById('kpiEntradasTrend').textContent = `${formatPercentChange(entradasChange)} vs mês anterior`;
  document.getElementById('kpiSaidasTrend').textContent = `${formatPercentChange(saidasChange)} vs mês anterior`;
  document.getElementById('kpiLucroLabel').textContent = `${monthlyTotals.lucro >= 0 ? 'Positivo' : 'Negativo'} · ${formatPercentChange(lucroChange)} vs mês anterior`;
  document.getElementById('kpiLucro').style.color = monthlyTotals.lucro >= 0 ? 'var(--green)' : 'var(--red)';
  const variationValue = document.getElementById('kpiVariacao');
  const variationTrend = document.getElementById('kpiVariacaoTrend');
  if (variationValue) {
    variationValue.textContent = formatPercentChange(lucroChange);
    variationValue.classList.toggle('positive', lucroChange >= 0);
    variationValue.classList.toggle('negative', lucroChange < 0);
  }
  if (variationTrend) {
    variationTrend.textContent = `Lucro vs mês anterior · ${formatBRL(previousTotals.lucro)}`;
  }

  renderDASInfo();
  renderDashboardInsights({ movPeriodo, monthlyTotals, periodTotals, saidasChange });
  renderDashboardFluxia({ movPeriodo, monthlyTotals, periodTotals });
  renderDashboardCharts({ months, movPeriodo });

  const ultimas = [...movPeriodo].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 8);
  const list = document.getElementById('dashMovList');
  if (!ultimas.length) {
    list.innerHTML = '<div class="empty-state">Nenhuma movimentação no período.</div>';
  } else {
    list.innerHTML = ultimas.map((m) => `
      <div class="mov-item">
        <div class="mov-item-left">
          <div class="mov-dot ${m.tipo}"></div>
          <div>
            <div class="mov-desc">${esc(m.desc)}</div>
            <div class="mov-date">${formatDate(m.data)} · ${esc(m.cat)}</div>
          </div>
        </div>
        <span class="mov-valor ${m.tipo}">${m.tipo === 'entrada' ? '+' : '-'}${formatBRL(m.valor)}</span>
      </div>
    `).join('');
  }
}

let movCurrentTipo = '';
let movCurrentCat  = '';
let movCurrentMes  = '';
let movCurrentText = '';
let movCurrentValorMin = 0;
let movCurrentValorMax = 0;

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
  movCurrentValorMin = parseBRL(document.getElementById('filtroValorMin')?.value || '');
  movCurrentValorMax = parseBRL(document.getElementById('filtroValorMax')?.value || '');

  updateMovCategoriaFilter();

  let movs = [...state.movimentacoes];
  if (movCurrentTipo) movs = movs.filter(m => m.tipo === movCurrentTipo);
  if (movCurrentCat)  movs = movs.filter(m => m.cat  === movCurrentCat);
  if (movCurrentMes)  movs = movs.filter(m => m.data && m.data.startsWith(movCurrentMes));
  if (movCurrentText) movs = movs.filter(m =>
    m.desc.toLowerCase().includes(movCurrentText) ||
    (m.cat || '').toLowerCase().includes(movCurrentText) ||
    (m.obs || '').toLowerCase().includes(movCurrentText)
  );
  if (movCurrentValorMin > 0) movs = movs.filter(m => m.valor >= movCurrentValorMin);
  if (movCurrentValorMax > 0) movs = movs.filter(m => m.valor <= movCurrentValorMax);

  movs.sort((a,b) => b.data.localeCompare(a.data));

  // Summary
  const ent = movs.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const sai = movs.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  document.getElementById('sumEntrada').textContent = formatBRL(ent);
  document.getElementById('sumSaida').textContent   = formatBRL(sai);
  document.getElementById('sumSaldo').textContent   = formatBRL(ent-sai);
  const sumQuantidade = document.getElementById('sumQuantidade');
  if (sumQuantidade) sumQuantidade.textContent = String(movs.length);

  const tbody = document.getElementById('movTableBody');
  const empty = document.getElementById('movEmpty');
  const mobileList = document.getElementById('movMobileList');

  if (!movs.length) {
    tbody.innerHTML = '';
    if (mobileList) mobileList.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  tbody.innerHTML = movs.map(m => `
    <tr class="movement-row ${m.tipo}">
      <td>
        <span class="movement-date">${formatDate(m.data)}</span>
      </td>
      <td>
        <div class="movement-desc-cell">
          <span class="movement-type-icon ${m.tipo}" aria-hidden="true">${getMovIconSvg(m.tipo)}</span>
          <div>
            <strong>${esc(m.desc)}</strong>
            ${m.clienteId ? `<span>Cliente: ${esc(getClienteNome(m.clienteId))}</span>` : ''}
            ${m.obs ? `<small>${esc(m.obs)}</small>` : ''}
          </div>
        </div>
      </td>
      <td><span class="badge-cat">${esc(m.cat)}</span></td>
      <td><span class="movement-payment">${pagIcon(m.pag)} ${esc(getPaymentLabel(m.pag))}</span></td>
      <td><span class="badge-tipo ${m.tipo}">${m.tipo==='entrada'?'↑ Entrada':'↓ Saída'}</span></td>
      <td class="movement-value ${m.tipo}">
        ${m.tipo==='entrada'?'+':'-'}${formatBRL(m.valor)}
      </td>
      <td>
        <div class="action-btns">
          <button class="btn-action" type="button" onclick="editarMov('${m.id}')">Editar</button>
          <button class="btn-action" type="button" disabled aria-disabled="true">Duplicar</button>
          <button class="btn-action delete" type="button" onclick="excluirMov('${m.id}')">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');

  if (mobileList) {
    mobileList.innerHTML = movs.map(m => `
      <article class="movement-mobile-card ${m.tipo}">
        <div class="movement-mobile-main">
          <span class="movement-type-icon ${m.tipo}" aria-hidden="true">${getMovIconSvg(m.tipo)}</span>
          <div>
            <strong>${esc(m.desc)}</strong>
            <span>${formatDate(m.data)} · ${esc(m.cat)}</span>
          </div>
        </div>
        <div class="movement-mobile-meta">
          <span class="badge-tipo ${m.tipo}">${m.tipo==='entrada'?'Receita':'Despesa'}</span>
          <strong class="movement-value ${m.tipo}">${m.tipo==='entrada'?'+':'-'}${formatBRL(m.valor)}</strong>
        </div>
        ${m.obs ? `<p>${esc(m.obs)}</p>` : ''}
        <div class="action-btns">
          <button class="btn-action" type="button" onclick="editarMov('${m.id}')">Editar</button>
          <button class="btn-action" type="button" disabled aria-disabled="true">Duplicar</button>
          <button class="btn-action delete" type="button" onclick="excluirMov('${m.id}')">Excluir</button>
        </div>
      </article>
    `).join('');
  }
}

function updateMovCategoriaFilter() {
  const catSelect = document.getElementById('filtroCategoria');
  if (!catSelect) return;
  const curCat = catSelect.value;
  const cats = [...new Set(state.movimentacoes.map(m=>m.cat))].sort();
  catSelect.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c=>`<option value="${esc(c)}" ${c===curCat?'selected':''}>${esc(c)}</option>`).join('');
}

function pagIcon(pag) {
  const icons = { pix:'⚡', dinheiro:'💵', cartao:'💳', boleto:'📄' };
  return icons[pag] || '';
}

function getPaymentLabel(pag) {
  const labels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', boleto: 'Boleto' };
  return labels[pag] || 'Não informado';
}

function getMovIconSvg(tipo) {
  if (tipo === 'entrada') {
    return '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>';
  }
  return '<svg viewBox="0 0 24 24"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>';
}

function limparFiltrosMovimentacoes() {
  document.getElementById('filtroTipo').value = '';
  document.getElementById('filtroCategoria').value = '';
  document.getElementById('filtroMes').value = getDashboardMes();
  document.getElementById('filtroTexto').value = '';
  const min = document.getElementById('filtroValorMin');
  const max = document.getElementById('filtroValorMax');
  if (min) min.value = '';
  if (max) max.value = '';
  applyFilters();
}

// ===== METAS FINANCEIRAS =====
function loadFinancialGoals() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FINANCIAL_GOALS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveFinancialGoals() {
  localStorage.setItem(FINANCIAL_GOALS_KEY, JSON.stringify(state.metas || []));
}

function getGoalExamples() {
  return {
    notebook: {
      nome: 'Comprar notebook',
      valor: 5000,
      descricao: 'Equipamento para melhorar a produtividade do MEI.'
    },
    capital: {
      nome: 'Capital de giro',
      valor: 8000,
      descricao: 'Reserva para manter o negócio saudável nos próximos meses.'
    },
    reserva: {
      nome: 'Reserva de emergência',
      valor: 12000,
      descricao: 'Proteção para imprevistos pessoais e profissionais.'
    },
    viagem: {
      nome: 'Viagem',
      valor: 4500,
      descricao: 'Planejamento financeiro para viajar sem comprometer o caixa.'
    },
    veiculo: {
      nome: 'Troca de veículo',
      valor: 25000,
      descricao: 'Entrada ou complemento para trocar o veículo de trabalho.'
    }
  };
}

function getDefaultGoalDeadline(days = 90) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function calcGoalSavedSince(goal) {
  const start = goal.createdAt ? String(goal.createdAt).slice(0, 10) : '';
  const movs = start
    ? state.movimentacoes.filter((mov) => mov.data >= start)
    : state.movimentacoes;
  const entradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0);
  const saidas = movs.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0);
  return Math.max(0, entradas - saidas);
}

function getGoalViewModel(goal) {
  const alvo = Number(goal.valor || 0);
  const atual = Math.min(alvo, calcGoalSavedSince(goal));
  const percent = alvo > 0 ? Math.min(100, Math.round((atual / alvo) * 100)) : 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = goal.prazo ? new Date(`${goal.prazo}T00:00:00`) : null;
  const daysLeft = deadline ? Math.ceil((deadline - today) / 86400000) : 0;
  const concluida = percent >= 100;
  const atrasada = !concluida && deadline && daysLeft < 0;
  const status = concluida
    ? { key: 'done', label: 'Concluída', className: 'done' }
    : atrasada
      ? { key: 'late', label: 'Atrasada', className: 'late' }
      : { key: 'progress', label: 'Em andamento', className: 'progress' };

  return {
    ...goal,
    alvo,
    atual,
    restante: Math.max(0, alvo - atual),
    percent,
    daysLeft,
    status
  };
}

function renderMetas() {
  state.metas = loadFinancialGoals();
  const metas = state.metas.map(getGoalViewModel);
  const total = metas.length;
  const concluidas = metas.filter(meta => meta.status.key === 'done').length;
  const incompletas = metas.filter(meta => meta.status.key !== 'done');
  const nearest = [...incompletas].sort((a, b) => (a.daysLeft || 99999) - (b.daysLeft || 99999))[0] || metas[0] || null;
  const totalSaved = metas.reduce((sum, meta) => sum + meta.atual, 0);
  const totalRemaining = metas.reduce((sum, meta) => sum + meta.restante, 0);
  const avgProgress = total ? Math.round(metas.reduce((sum, meta) => sum + meta.percent, 0) / total) : 0;

  setText('goalsTotal', String(total));
  setText('goalsDone', String(concluidas));
  setText('goalsNearest', nearest ? nearest.nome : '-');
  setText('goalsRemaining', formatBRL(totalRemaining));
  setText('goalsSavedTotal', formatBRL(totalSaved));
  setText('goalsNearestName', nearest ? nearest.nome : '-');
  setText('goalsDaysLeft', nearest ? formatGoalDaysLeft(nearest.daysLeft) : '0');
  setText('goalsAverageProgress', `${avgProgress}%`);
  renderGoalFluxiaInsight(nearest);

  const grid = document.getElementById('goalsGrid');
  const empty = document.getElementById('goalsEmpty');
  if (!grid || !empty) return;
  empty.hidden = metas.length > 0;
  grid.innerHTML = metas.map(renderGoalCard).join('');
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function renderGoalCard(meta) {
  return `
    <article class="goal-card ${meta.status.className}">
      <div class="goal-card-header">
        <div>
          <span class="goal-status ${meta.status.className}">${meta.status.label}</span>
          <h2>${esc(meta.nome)}</h2>
          ${meta.descricao ? `<p>${esc(meta.descricao)}</p>` : ''}
        </div>
        <div class="goal-card-actions">
          <button class="btn-action" type="button" onclick="editarMeta('${meta.id}')">Editar</button>
          <button class="btn-action delete" type="button" onclick="excluirMeta('${meta.id}')">Excluir</button>
        </div>
      </div>
      <div class="goal-progress-block" aria-label="${meta.percent}% concluído">
        <div class="goal-progress-meta">
          <strong>${meta.percent}%</strong>
          <span>${formatBRL(meta.atual)} de ${formatBRL(meta.alvo)}</span>
        </div>
        <div class="goal-progress-track">
          <span style="width:${meta.percent}%"></span>
        </div>
      </div>
      <div class="goal-card-details">
        <div><span>Valor alvo</span><strong>${formatBRL(meta.alvo)}</strong></div>
        <div><span>Valor atual</span><strong>${formatBRL(meta.atual)}</strong></div>
        <div><span>Prazo</span><strong>${meta.prazo ? formatDate(meta.prazo) : '-'}</strong></div>
        <div><span>Restante</span><strong>${formatBRL(meta.restante)}</strong></div>
      </div>
    </article>
  `;
}

function formatGoalDaysLeft(days) {
  if (days < 0) return `${Math.abs(days)} atrasado`;
  if (days === 0) return 'Hoje';
  return `${days} dias`;
}

function renderGoalFluxiaInsight(nearest) {
  const target = document.getElementById('goalsFluxiaInsight');
  if (!target) return;
  if (!state.movimentacoes.length) {
    target.textContent = 'Cadastre movimentações para receber previsões da FluxIA.';
    return;
  }
  if (!nearest) {
    target.textContent = 'Crie uma meta para receber recomendações com base no seu histórico.';
    return;
  }

  const recent = state.movimentacoes
    .filter((mov) => mov.data >= getDateDaysAgo(30));
  const entrada = recent.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0);
  const saida = recent.filter(m => m.tipo === 'saida').reduce((s, m) => s + m.valor, 0);
  const average = Math.max(0, (entrada - saida) / 30);
  if (average <= 0) {
    target.textContent = 'Sua média recente ainda não gera previsão positiva. Revise despesas para acelerar esta meta.';
    return;
  }
  const days = Math.ceil(nearest.restante / average);
  target.textContent = `Se mantiver sua média atual, esta meta será atingida em aproximadamente ${days} dias.`;
}

function getDateDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function resetMetaForm() {
  document.getElementById('modalMetaTitle').textContent = 'Nova Meta';
  document.getElementById('metaId').value = '';
  document.getElementById('metaNome').value = '';
  document.getElementById('metaValor').value = '';
  document.getElementById('metaPrazo').value = getDefaultGoalDeadline();
  document.getElementById('metaDescricao').value = '';
}

function openNovaMeta() {
  resetMetaForm();
  openModal('modalMeta');
}

function preencherExemploMeta(key) {
  const example = getGoalExamples()[key];
  if (!example) return;
  if (!document.getElementById('modalMeta')?.classList.contains('open')) {
    resetMetaForm();
    openModal('modalMeta');
  }
  document.getElementById('metaNome').value = example.nome;
  document.getElementById('metaValor').value = formatBRL(example.valor).replace('R$', '').trim();
  document.getElementById('metaPrazo').value = getDefaultGoalDeadline(key === 'reserva' || key === 'veiculo' ? 180 : 90);
  document.getElementById('metaDescricao').value = example.descricao;
}

function editarMeta(id) {
  const meta = state.metas.find(item => item.id === id);
  if (!meta) return;
  document.getElementById('modalMetaTitle').textContent = 'Editar Meta';
  document.getElementById('metaId').value = meta.id;
  document.getElementById('metaNome').value = meta.nome;
  document.getElementById('metaValor').value = formatBRL(meta.valor).replace('R$', '').trim();
  document.getElementById('metaPrazo').value = meta.prazo || getDefaultGoalDeadline();
  document.getElementById('metaDescricao').value = meta.descricao || '';
  openModal('modalMeta');
}

async function excluirMeta(id) {
  const confirmed = await confirmarAcao({
    title: 'Excluir meta',
    message: 'Essa meta sera removida do seu painel financeiro.',
    confirmText: 'Excluir',
    danger: true
  });
  if (!confirmed) return;
  state.metas = state.metas.filter(meta => meta.id !== id);
  saveFinancialGoals();
  renderMetas();
  showToast('Meta excluida.', 'error');
}

function salvarMeta() {
  const id = document.getElementById('metaId').value;
  const nome = document.getElementById('metaNome').value.trim();
  const valor = parseBRL(document.getElementById('metaValor').value);
  const prazo = document.getElementById('metaPrazo').value;
  const descricao = document.getElementById('metaDescricao').value.trim();

  if (!nome) { showToast('Informe o nome da meta.', 'error'); return; }
  if (!valor || valor <= 0) { showToast('Informe um objetivo valido.', 'error'); return; }
  if (!prazo) { showToast('Informe o prazo da meta.', 'error'); return; }

  const existing = state.metas.find(meta => meta.id === id);
  const payload = {
    id: id || `goal-${Date.now()}`,
    nome,
    valor,
    prazo,
    descricao,
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  state.metas = existing
    ? state.metas.map(meta => meta.id === id ? payload : meta)
    : [payload, ...state.metas];

  saveFinancialGoals();
  closeModal('modalMeta');
  renderMetas();
  showToast(existing ? 'Meta atualizada!' : 'Meta criada!');
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
  const nome = state.config.nome || state.profile?.nome || state.user?.user_metadata?.nome || 'FluxMEI';
  const email = state.user?.email || 'email@exemplo.com';
  const statusMeta = getSidebarSubscriptionMeta();
  document.querySelectorAll('.user-name').forEach(el=>el.textContent=nome);
  document.querySelectorAll('.user-avatar').forEach(el=>el.textContent=nome.charAt(0).toUpperCase());
  document.querySelectorAll('.user-plan').forEach(el=>el.textContent=getPlanLabel());
  document.querySelectorAll('.user-email').forEach(el=>el.textContent=email);
  document.querySelectorAll('.user-status').forEach((el) => {
    el.textContent = statusMeta.label;
    el.classList.toggle('warning', statusMeta.warning);
  });
  renderSidebarUpgradeCta();
}

function getSidebarSubscriptionMeta(status = subscriptionStatus) {
  const estado = status?.estado || status?.status || '';
  const dias = Number(status?.dias_restantes || 0);
  if (status?.bloqueado || ['expirado', 'bloqueado', 'vencido'].includes(estado)) {
    return { label: 'Acesso requer atenção', warning: true };
  }
  if (['pendente_pagamento', 'pendente'].includes(estado)) {
    return { label: 'Pagamento pendente', warning: true };
  }
  if (estado === 'teste_gratis') {
    return { label: dias ? `Trial: ${dias} dia(s)` : 'Trial ativo', warning: dias <= 3 };
  }
  if (estado === 'ativo') {
    return { label: dias ? `Ativo: ${dias} dia(s)` : 'Assinatura ativa', warning: dias <= 7 };
  }
  return { label: 'Status da assinatura', warning: false };
}

function renderSidebarUpgradeCta(status = subscriptionStatus) {
  const root = document.getElementById('sidebarUpgradeCta');
  if (!root) return;
  const text = document.getElementById('sidebarUpgradeText');
  const action = document.getElementById('sidebarUpgradeAction');
  const estado = status?.estado || status?.status || '';
  const dias = Number(status?.dias_restantes || 0);
  const isBlocked = status?.bloqueado || ['expirado', 'bloqueado', 'vencido'].includes(estado);
  const isTrial = estado === 'teste_gratis';
  const needsRenewal = estado === 'ativo' && dias > 0 && dias <= 7;
  const isPending = ['pendente_pagamento', 'pendente'].includes(estado);

  if (!isBlocked && !isTrial && !needsRenewal && !isPending) {
    root.hidden = true;
    return;
  }

  root.hidden = false;
  if (text) {
    text.textContent = isBlocked
      ? 'Renove para continuar acessando seus dados.'
      : isPending
        ? 'Finalize o pagamento para manter seu acesso.'
        : needsRenewal
          ? `Seu plano vence em ${dias} dia(s).`
          : 'Assine para continuar após o período gratuito.';
  }
  if (action) {
    action.textContent = isBlocked || needsRenewal || isPending ? 'Renovar' : 'Assinar agora';
    action.href = getCheckoutUrlForPlan(getCurrentPlanId(status) !== 'gratuito' ? getCurrentPlanId(status) : 'pro_mensal');
  }
}

function openAccountSection(section) {
  openAccountPanel();
  const selectors = {
    referral: '#accountReferralCard',
    export: '.account-export-card',
    payments: '#accountPaymentHistorySection'
  };
  const selector = selectors[section];
  if (!selector) return;
  window.setTimeout(() => {
    document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}

function handleSidebarAction(action) {
  if (action === 'account') {
    openAccountPanel();
    return;
  }
  if (action === 'referral' || action === 'export' || action === 'payments') {
    openAccountSection(action);
    return;
  }
  if (action === 'support') {
    showToast('Fale com o suporte pelo e-mail suporte@fluxmei.com.br.');
  }
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
    openNovaMeta,
    preencherExemploMeta,
    editarMeta,
    excluirMeta,
    salvarMeta,
    criarClienteRapido,
    resetClienteForm,
    editarCliente,
    excluirCliente,
    salvarCliente,
    salvarConfig,
    salvarDAS,
    limparTudo,
    confirmPlanSwitch,
    cancelSubscription,
    reactivateSubscription
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

// ===== ASSISTENTE FINANCEIRO IA =====
function aiMarkdown(text) {
  return esc(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br>');
}

function getAiInsightIcon(type) {
  const icons = {
    positive: '↑',
    warning: '!',
    danger: '!',
    info: 'i',
    goal: '◎'
  };
  return icons[type] || 'i';
}

function renderAiInsights() {
  const root = document.getElementById('aiInsightsGrid');
  if (!root) return;

  if (!state.aiInsights.length) {
    root.innerHTML = `
      <article class="ai-insight-card info loading">
        <span>${getAiInsightIconSvg('info')}</span>
        <p>Carregando analise automatica das suas financas...</p>
      </article>
    `;
    return;
  }

  root.innerHTML = state.aiInsights.map((insight, index) => `
    <article class="ai-insight-card ${esc(insight.type || 'info')}" style="--delay:${index * 60}ms">
      <span>${getAiInsightIconSvg(insight.type || 'info')}</span>
      <div>
        <p>${esc(insight.title)}</p>
        ${insight.metric !== undefined ? `<strong>${typeof insight.metric === 'number' ? formatBRL(insight.metric) : esc(insight.metric)}</strong>` : ''}
        <small>${getAiInsightAction(insight.type || 'info')}</small>
      </div>
    </article>
  `).join('');
}

function getAiInsightIconSvg(type) {
  const icons = {
    positive: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l6-6 4 4 6-8"/><path d="M15 7h5v5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3L12 3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 17h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
    goal: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M19 5l-3 3"/></svg>'
  };
  return icons[type] || icons.info;
}

function getAiInsightAction(type) {
  const actions = {
    positive: 'Continue acompanhando',
    warning: 'Revise este ponto',
    danger: 'Priorize agora',
    goal: 'Planeje o proximo passo',
    info: 'Veja no chat'
  };
  return actions[type] || actions.info;
}

function renderAiHistory() {
  const root = document.getElementById('aiHistoryList');
  if (!root) return;

  if (!state.aiConversations.length) {
    root.innerHTML = `
      <div class="ai-history-empty">
        <strong>Nenhuma conversa ainda</strong>
        <span>Use uma sugestao rapida ou envie sua primeira pergunta.</span>
      </div>
    `;
    return;
  }

  root.innerHTML = state.aiConversations.map((conversation) => `
    <div class="ai-history-item ${conversation.id === state.aiActiveConversationId ? 'active' : ''}">
      <button type="button" data-ai-conversation="${esc(conversation.id)}">
        <strong>${esc(conversation.title || 'Nova conversa')}</strong>
        <span>${formatDate(String(conversation.updated_at || conversation.created_at || '').slice(0, 10))}</span>
      </button>
      <div class="ai-history-actions">
        <button type="button" title="Renomear" data-ai-rename="${esc(conversation.id)}">Editar</button>
        <button type="button" title="Excluir" data-ai-delete="${esc(conversation.id)}">Excluir</button>
      </div>
    </div>
  `).join('');
}

function renderAiMessages() {
  const root = document.getElementById('aiChatMessages');
  if (!root) return;

  if (!state.aiMessages.length && !state.aiLoading) {
    root.innerHTML = `
      <div class="ai-empty-chat">
        <div class="ai-empty-illustration" aria-hidden="true">
          <svg viewBox="0 0 160 120" role="img">
            <rect x="22" y="18" width="116" height="84" rx="18"></rect>
            <path d="M43 76l22-22 18 14 30-36"></path>
            <circle cx="43" cy="76" r="5"></circle>
            <circle cx="65" cy="54" r="5"></circle>
            <circle cx="83" cy="68" r="5"></circle>
            <circle cx="113" cy="32" r="5"></circle>
          </svg>
        </div>
        <strong>Cadastre algumas receitas e despesas para a FluxIA gerar análises mais precisas.</strong>
        <button class="fm-btn fm-btn-primary" type="button" data-open-movimentacao onclick="openNovaMovimentacao()">Adicionar movimentação</button>
      </div>
    `;
    return;
  }

  root.innerHTML = state.aiMessages.map((message) => `
    <article class="ai-message ${esc(message.role)}">
      ${message.role === 'assistant' ? '<span class="ai-message-avatar">FX</span>' : ''}
      <div>
        ${message.role === 'assistant' ? '<strong class="ai-message-author">FluxIA</strong>' : ''}
        ${message.role === 'assistant' ? `<p>${aiMarkdown(message.content)}</p>` : esc(message.content)}
      </div>
    </article>
  `).join('') + (state.aiLoading ? `
    <article class="ai-message assistant typing">
      <span class="ai-message-avatar">FX</span>
      <div>
        <strong class="ai-message-author">FluxIA</strong>
        <p>Analisando suas finanças...</p>
        <span></span><span></span><span></span>
      </div>
    </article>
  ` : '');
  root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
}

function renderAiAssistant() {
  renderAiInsights();
  renderAiHistory();
  renderAiMessages();
  if (!state.aiLoaded) loadAiAssistant();
}

async function loadAiAssistant() {
  try {
    const [insights, conversations] = await Promise.all([
      apiRequest('/ai/insights'),
      apiRequest('/ai/conversations')
    ]);
    state.aiInsights = Array.isArray(insights.insights) ? insights.insights : [];
    state.aiConversations = Array.isArray(conversations.conversations) ? conversations.conversations : [];
    state.aiLoaded = true;
    renderAiAssistant();
  } catch (error) {
    state.aiInsights = [{ type: 'danger', title: error.message || 'Nao foi possivel carregar o assistente.', metric: 0 }];
    renderAiInsights();
  }
}

async function openAiConversation(id) {
  const data = await apiRequest(`/ai/conversations/${encodeURIComponent(id)}`);
  state.aiActiveConversationId = data.conversation?.id || id;
  state.aiMessages = Array.isArray(data.messages) ? data.messages : [];
  renderAiHistory();
  renderAiMessages();
}

function newAiConversation() {
  state.aiActiveConversationId = null;
  state.aiMessages = [];
  renderAiHistory();
  renderAiMessages();
  document.getElementById('aiChatInput')?.focus();
}

async function submitAiMessage(event) {
  event.preventDefault();
  const input = document.getElementById('aiChatInput');
  const message = String(input?.value || '').trim();
  if (!message || state.aiLoading) return;

  input.value = '';
  state.aiMessages.push({
    id: `local-${Date.now()}`,
    role: 'user',
    content: message,
    created_at: new Date().toISOString()
  });
  state.aiLoading = true;
  renderAiMessages();

  try {
    const response = await apiRequest('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_id: state.aiActiveConversationId
      })
    });
    state.aiActiveConversationId = response.conversation?.id || state.aiActiveConversationId;
    state.aiMessages = state.aiMessages
      .filter((item) => !String(item.id).startsWith('local-'))
      .concat(Array.isArray(response.messages) ? response.messages : []);
    if (Array.isArray(response.insights)) state.aiInsights = response.insights;
    state.aiLoaded = false;
    await loadAiAssistant();
    if (state.aiActiveConversationId) await openAiConversation(state.aiActiveConversationId);
  } catch (error) {
    state.aiMessages.push({
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: error.message || 'Nao foi possivel responder agora.',
      created_at: new Date().toISOString()
    });
  } finally {
    state.aiLoading = false;
    renderAiMessages();
  }
}

async function renameAiConversation(id) {
  const current = state.aiConversations.find((item) => item.id === id);
  const title = window.prompt('Novo nome da conversa', current?.title || 'Nova conversa');
  if (!title) return;
  await apiRequest(`/ai/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
  state.aiLoaded = false;
  await loadAiAssistant();
}

async function deleteAiConversation(id) {
  if (!window.confirm('Excluir esta conversa?')) return;
  await apiRequest(`/ai/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (state.aiActiveConversationId === id) newAiConversation();
  state.aiLoaded = false;
  await loadAiAssistant();
}

function handleAiHistoryClick(event) {
  const conversationButton = event.target.closest('[data-ai-conversation]');
  const renameButton = event.target.closest('[data-ai-rename]');
  const deleteButton = event.target.closest('[data-ai-delete]');

  if (renameButton) {
    renameAiConversation(renameButton.dataset.aiRename);
    return;
  }
  if (deleteButton) {
    deleteAiConversation(deleteButton.dataset.aiDelete);
    return;
  }
  if (conversationButton) {
    openAiConversation(conversationButton.dataset.aiConversation).catch((error) => {
      showToast(error.message || 'Nao foi possivel abrir a conversa.', 'error');
    });
  }
}

function handleAiSuggestion(event) {
  const button = event.target.closest('[data-ai-prompt]');
  if (!button) return;
  const input = document.getElementById('aiChatInput');
  if (input) {
    input.value = button.dataset.aiPrompt || '';
    input.focus();
  }
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
    const sidebar = document.getElementById('sidebar');
    setMobileMenuState(!sidebar?.classList.contains('mobile-open'));
  });
  document.getElementById('mobileOverlay').addEventListener('click', closeMobileMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMobileMenu();
  });
  window.addEventListener('hashchange', () => {
    navigate(getInitialRoute(), { updateHash: false });
  });

  document.getElementById('accountMenuButton')?.addEventListener('click', openAccountPanel);
  document.querySelectorAll('[data-sidebar-action]').forEach((button) => {
    button.addEventListener('click', () => {
      navigate(button.dataset.sidebarAction);
    });
  });
  document.getElementById('accountModalClose')?.addEventListener('click', closeAccountPanel);
  document.getElementById('accountPlanSwitchAction')?.addEventListener('click', (event) => {
    confirmPlanSwitch(event.currentTarget.dataset.targetPlan);
  });
  document.getElementById('accountQuickSwitch')?.addEventListener('click', (event) => {
    confirmPlanSwitch(event.currentTarget.dataset.targetPlan);
  });
  document.getElementById('accountQuickHistory')?.addEventListener('click', scrollToPaymentHistory);
  document.getElementById('accountReferralCopy')?.addEventListener('click', copyReferralLink);
  document.getElementById('accountReferralShare')?.addEventListener('click', shareReferralLink);
  document.getElementById('exportCsvAction')?.addEventListener('click', (event) => handleExportClick('csv', event.currentTarget));
  document.getElementById('exportJsonAction')?.addEventListener('click', (event) => handleExportClick('json', event.currentTarget));
  document.getElementById('exportSummaryAction')?.addEventListener('click', (event) => handleExportClick('resumo', event.currentTarget));
  document.querySelectorAll('[data-dashboard-export]').forEach((button) => {
    button.addEventListener('click', (event) => handleExportClick(event.currentTarget.dataset.dashboardExport || 'resumo', event.currentTarget));
  });
  document.getElementById('aiChatForm')?.addEventListener('submit', submitAiMessage);
  document.getElementById('aiNewConversation')?.addEventListener('click', newAiConversation);
  document.getElementById('aiHistoryList')?.addEventListener('click', handleAiHistoryClick);
  document.getElementById('aiSuggestions')?.addEventListener('click', handleAiSuggestion);
  document.getElementById('accountCancelAction')?.addEventListener('click', cancelSubscription);
  document.getElementById('accountReactivateAction')?.addEventListener('click', reactivateSubscription);
  document.getElementById('receiptClose')?.addEventListener('click', closeReceiptModal);
  document.getElementById('receiptCloseFooter')?.addEventListener('click', closeReceiptModal);
  document.getElementById('receiptPrintAction')?.addEventListener('click', printReceipt);
  document.getElementById('accountPaymentHistory')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-receipt-id]');
    if (button) openPaymentReceipt(button.dataset.receiptId);
    const pixButton = event.target.closest('[data-copy-pix]');
    if (pixButton) copyTextToClipboard(pixButton.dataset.copyPix, 'Codigo Pix copiado.');
  });
  document.getElementById('onboardingNext')?.addEventListener('click', nextOnboardingStep);
  document.getElementById('onboardingBack')?.addEventListener('click', previousOnboardingStep);
  document.getElementById('onboardingClose')?.addEventListener('click', closeOnboarding);
  document.addEventListener('click', handleSmartAlertClick);
  document.getElementById('accountModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'accountModal') closeAccountPanel();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeAccountPanel();
  });

  // Modal backdrops close on outside click
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => {
      if (e.target === bd && bd.id === 'onboardingModal') {
        closeOnboarding();
        return;
      }
      if (e.target === bd) closeModal(bd.id);
    });
  });

  // Valor mask
  document.getElementById('movValor').addEventListener('input', function(){ maskValor(this); });
  document.getElementById('metaValor')?.addEventListener('input', function(){ maskValor(this); });
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
  const dashboardPeriodoInput = document.getElementById('dashboardPeriodo');
  if (dashboardPeriodoInput) {
    dashboardPeriodoInput.value = ['month', '3m', '6m', 'year'].includes(dashboardPeriodo) ? dashboardPeriodo : 'month';
    dashboardPeriodoInput.addEventListener('change', () => {
      dashboardPeriodo = dashboardPeriodoInput.value || 'month';
      localStorage.setItem(DASHBOARD_PERIOD_KEY, dashboardPeriodo);
      renderDashboard();
    });
  }
  document.getElementById('filtroTipo').addEventListener('change', applyFilters);
  document.getElementById('filtroCategoria').addEventListener('change', applyFilters);
  document.getElementById('filtroMes').addEventListener('change', applyFilters);
  document.getElementById('filtroTexto').addEventListener('input', applyFilters);
  document.getElementById('filtroValorMin')?.addEventListener('input', applyFilters);
  document.getElementById('filtroValorMax')?.addEventListener('input', applyFilters);
  document.getElementById('limparFiltrosMov')?.addEventListener('click', limparFiltrosMovimentacoes);
  document.querySelectorAll('[data-goal-example]').forEach((button) => {
    button.addEventListener('click', () => preencherExemploMeta(button.dataset.goalExample));
  });
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
  navigate(getInitialRoute(), { replaceHash: true });
  updateSidebarUser();
  window.setTimeout(openOnboarding, 180);
}

document.addEventListener('DOMContentLoaded', init);
exposeGlobalHandlers();
