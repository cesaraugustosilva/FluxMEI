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
  const urls = [];
  const addUrl = (url) => {
    const normalized = normalizeApiUrl(url);
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
  };

  addUrl(localStorage.getItem('fluxmei_api_url'));
  if (window.location.protocol.startsWith('http')) {
    if (window.location.port === '3002') addUrl(`${window.location.origin}/api`);
    addUrl('http://localhost:3002/api');
    addUrl('http://127.0.0.1:3002/api');
  } else {
    addUrl('http://localhost:3002/api');
    addUrl('http://127.0.0.1:3002/api');
  }

  return urls;
}
const API_URLS = resolveApiUrls();
const TOKEN_KEY = 'fluxmei_access_token';
const DASHBOARD_MONTH_KEY = 'fluxmei_dashboard_mes';

// ===== STATE =====
let state = {
  movimentacoes: [],
  clientes: [],
  das: [],
  profile: null,
  config: { nome: '', cnpj: '', ramo: '', dasDia: '', dasValor: '' }
};

let currentPage = 'dashboard';
let calendarDate = new Date();
let movTipo = 'entrada';
let editingMovId = null;
let editingClienteId = null;
let dashChart = null;
let relChart = null;
let dashboardMes = localStorage.getItem(DASHBOARD_MONTH_KEY) || '';

// ===== API =====
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function apiRequest(path, options = {}) {
  const token = getToken();
  if (!token) {
    window.location.href = 'auth/login.html';
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
    throw new Error('Nao foi possivel conectar a API. Inicie o servidor web com npm.cmd start e acesse http://localhost:3002.');
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;
  const text = isJson ? '' : await response.text();

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = 'auth/login.html';
    throw new Error('Sessão expirada.');
  }

  if (!response.ok) {
    const message = data?.error || text?.trim();
    throw new Error(message || `Erro ${response.status} ao chamar ${url}.`);
  }
  return data;
}

function mapMovimentacao(item) {
  return {
    id: item.id,
    tipo: item.tipo,
    desc: item.descricao,
    valor: Number(item.valor),
    cat: item.categoria,
    pag: item.forma_pagamento,
    data: item.data,
    obs: item.observacao || ''
  };
}

function mapCliente(item) {
  return {
    id: item.id,
    nome: item.nome,
    tel: item.telefone,
    email: item.email,
    obs: item.observacao
  };
}

function hydrateConfig(profile, dasList) {
  const nextDas = [...(dasList || [])]
    .filter((item) => item.status !== 'pago')
    .sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)))[0];

  state.config = {
    nome: profile?.nome_negocio || profile?.nome || '',
    cnpj: profile?.cnpj || '',
    ramo: profile?.ramo || profile?.tipo_negocio || '',
    dasDia: nextDas?.vencimento ? Number(nextDas.vencimento.split('-')[2]) : '',
    dasValor: nextDas?.valor ? String(Number(nextDas.valor).toFixed(2)).replace('.', ',') : ''
  };
}

async function loadState() {
  const [me, movimentacoes, clientes, das] = await Promise.all([
    apiRequest('/auth/me'),
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
    case 'clientes':       renderClientes(); break;
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
  document.getElementById(id).classList.remove('open');
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
    cats.map(c=>`<option value="${c}" ${c===curCat?'selected':''}>${c}</option>`).join('');
}

function pagIcon(pag) {
  const icons = { pix:'⚡', dinheiro:'💵', cartao:'💳', boleto:'📄' };
  return icons[pag] || '';
}

// ===== MOVIMENTAÇÃO FORM =====
function setTipo(tipo) {
  movTipo = tipo;
  document.getElementById('btnEntrada').classList.toggle('active', tipo==='entrada');
  document.getElementById('btnSaida').classList.toggle('active', tipo==='saida');
  updateCategorias();
}

function updateCategorias() {
  const sel = document.getElementById('movCategoria');
  const cats = movTipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  sel.innerHTML = cats.map(c=>`<option value="${c}">${c}</option>`).join('');
}

function resetMovForm() {
  editingMovId = null;
  document.getElementById('movId').value = '';
  document.getElementById('movDesc').value = '';
  document.getElementById('movValor').value = '';
  document.getElementById('movObs').value = '';
  document.getElementById('movData').value = new Date().toISOString().split('T')[0];
  document.querySelector('input[name="pagamento"][value="pix"]').checked = true;
  document.getElementById('modalMovTitle').textContent = 'Nova Movimentação';
  setTipo('entrada');
}

function openNovaMovimentacao(date) {
  resetMovForm();
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
  const sel = document.getElementById('movCategoria');
  [...sel.options].forEach(o => { if(o.value===m.cat) o.selected=true; });
  const pagRadio = document.querySelector(`input[name="pagamento"][value="${m.pag}"]`);
  if (pagRadio) pagRadio.checked = true;
  openModal('modalMovimentacao');
}

async function excluirMov(id) {
  if (!confirm('Excluir esta movimentação?')) return;
  try {
    await apiRequest(`/movimentacoes/${id}`, { method: 'DELETE' });
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
    observacao: obs || null
  };

  try {
    if (editingMovId) {
      await apiRequest(`/movimentacoes/${editingMovId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Movimentação atualizada! ✅');
    } else {
      await apiRequest('/movimentacoes', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
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
  if (busca) clientes = clientes.filter(c => c.nome.toLowerCase().includes(busca) || (c.email||'').toLowerCase().includes(busca));

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
        ${c.email ? `✉️ <a href="mailto:${c.email}">${esc(c.email)}</a><br>` : ''}
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
  document.getElementById('clienteEmail').value = '';
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
  document.getElementById('clienteEmail').value = c.email || '';
  document.getElementById('clienteObs').value   = c.obs || '';
  openModal('modalCliente');
}

async function excluirCliente(id) {
  if (!confirm('Excluir este cliente?')) return;
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
  const email = document.getElementById('clienteEmail').value.trim();
  const obs   = document.getElementById('clienteObs').value.trim();

  if (!nome) { showToast('Informe o nome do cliente.', 'error'); return; }

  const payload = { nome, telefone: tel, email, observacao: obs };

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
      <div class="kpi-header"><span class="kpi-label">${periodo.resultadoLabel}</span><span class="kpi-icon">⬡</span></div>
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
      <div class="kpi-header"><span class="kpi-label">Resultado Anual</span><span class="kpi-icon">⬡</span></div>
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
  document.getElementById('cfgCnpj').value     = state.config.cnpj || '';
  document.getElementById('cfgRamo').value     = state.config.ramo || '';
  document.getElementById('cfgDasDia').value   = state.config.dasDia || '';
  document.getElementById('cfgDasValor').value = state.config.dasValor || '';
  updateDasPreview();
  updateSidebarUser();
}

async function salvarConfig() {
  state.config.nome = document.getElementById('cfgNome').value.trim();
  state.config.cnpj = document.getElementById('cfgCnpj').value.trim();
  state.config.ramo = document.getElementById('cfgRamo').value.trim();

  try {
    await apiRequest('/auth/me/profile', {
      method: 'PUT',
      body: JSON.stringify({
        nome: state.profile?.nome || state.config.nome || 'Usuário FluxMEI',
        nome_negocio: state.config.nome,
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
}

async function limparTudo() {
  if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
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
    setTipo,
    openNovaMovimentacao,
    editarMov,
    excluirMov,
    salvarMovimentacao,
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
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== INIT =====
async function init() {
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

  // Modal backdrops close on outside click
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => {
      if (e.target === bd) closeModal(bd.id);
    });
  });

  // Valor mask
  document.getElementById('movValor').addEventListener('input', function(){ maskValor(this); });

  document.querySelectorAll('[data-open-movimentacao]').forEach((button) => {
    button.addEventListener('click', () => openNovaMovimentacao());
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
  document.getElementById('buscaCliente').addEventListener('input', renderClientes);

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
