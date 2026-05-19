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

// ===== STATE =====
let state = {
  movimentacoes: [],
  clientes: [],
  config: { nome: 'Meu MEI', cnpj: '', ramo: '', dasDia: 20, dasValor: '72,60' }
};

let currentPage = 'dashboard';
let calendarDate = new Date();
let movTipo = 'entrada';
let editingMovId = null;
let editingClienteId = null;
let dashChart = null;
let relChart = null;

// ===== STORAGE =====
function saveState() {
  localStorage.setItem('fluxmei_v1', JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem('fluxmei_v1');
  if (raw) {
    try { state = JSON.parse(raw); } catch(e) {}
  } else {
    criarDadosExemplo();
  }
}

// ===== EXAMPLE DATA =====
function criarDadosExemplo() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();

  const exemplos = [
    { tipo:'entrada', desc:'Serviço de design gráfico', valor:850, cat:'Serviço',    data:fmtDate(ano,mes,3),  pag:'pix' },
    { tipo:'entrada', desc:'Venda de produtos online',  valor:420, cat:'Venda',      data:fmtDate(ano,mes,5),  pag:'pix' },
    { tipo:'saida',   desc:'DAS Mensal',                valor:72.60,cat:'DAS',       data:fmtDate(ano,mes,7),  pag:'boleto' },
    { tipo:'entrada', desc:'Projeto de identidade visual',valor:1200,cat:'Serviço',  data:fmtDate(ano,mes,8),  pag:'pix' },
    { tipo:'saida',   desc:'Fornecedor de insumos',     valor:180, cat:'Fornecedor', data:fmtDate(ano,mes,10), pag:'pix' },
    { tipo:'saida',   desc:'Plano de internet',         valor:99.90,cat:'Internet',  data:fmtDate(ano,mes,12), pag:'boleto' },
    { tipo:'entrada', desc:'Pagamento cliente Mariana', valor:650, cat:'Pagamento de Cliente', data:fmtDate(ano,mes,14), pag:'pix' },
    { tipo:'saida',   desc:'Transporte / combustível',  valor:95,  cat:'Transporte', data:fmtDate(ano,mes,15), pag:'dinheiro' },
    { tipo:'entrada', desc:'Venda produto físico',      valor:230, cat:'Venda',      data:fmtDate(ano,mes,17), pag:'cartao' },
    { tipo:'saida',   desc:'Instagram Ads',             valor:150, cat:'Marketing',  data:fmtDate(ano,mes,18), pag:'cartao' },
    { tipo:'entrada', desc:'Consultoria mensal',        valor:900, cat:'Serviço',    data:fmtDate(ano,mes,20), pag:'pix' },
    { tipo:'saida',   desc:'Aluguel sala compartilhada',valor:400, cat:'Aluguel',    data:fmtDate(ano,mes,21), pag:'boleto' },
    // Mês anterior
    { tipo:'entrada', desc:'Serviço de fotografia',    valor:700, cat:'Serviço',    data:fmtDate(ano,mes-1,10), pag:'pix' },
    { tipo:'entrada', desc:'Venda parcelada',          valor:360, cat:'Venda',      data:fmtDate(ano,mes-1,18), pag:'cartao' },
    { tipo:'saida',   desc:'DAS Mensal',               valor:72.60,cat:'DAS',       data:fmtDate(ano,mes-1,7),  pag:'boleto' },
    { tipo:'saida',   desc:'Fornecedor embalagens',    valor:130, cat:'Fornecedor', data:fmtDate(ano,mes-1,22), pag:'pix' },
    { tipo:'saida',   desc:'Plano de internet',        valor:99.90,cat:'Internet',  data:fmtDate(ano,mes-1,12), pag:'boleto' },
    // 2 meses atrás
    { tipo:'entrada', desc:'Serviço de edição',        valor:550, cat:'Serviço',    data:fmtDate(ano,mes-2,8),  pag:'pix' },
    { tipo:'saida',   desc:'DAS Mensal',               valor:72.60,cat:'DAS',       data:fmtDate(ano,mes-2,7),  pag:'boleto' },
    { tipo:'entrada', desc:'Venda online',             valor:490, cat:'Venda',      data:fmtDate(ano,mes-2,15), pag:'pix' },
  ];

  state.movimentacoes = exemplos.map((m, i) => ({
    ...m, id: 'mov_' + (i+1), obs: ''
  }));

  state.clientes = [
    { id:'cli_1', nome:'Ana Paula Silva',  tel:'(11) 98765-4321', email:'ana@email.com', obs:'Cliente fidelizada, prefere pagamento via PIX.' },
    { id:'cli_2', nome:'Bruno Ferreira',   tel:'(11) 91234-5678', email:'bruno@empresa.com', obs:'Contrata serviços mensais de design.' },
    { id:'cli_3', nome:'Mariana Oliveira', tel:'(21) 99988-7766', email:'mari@gmail.com', obs:'' },
  ];

  state.config = { nome: 'Meu MEI', cnpj: '', ramo: '', dasDia: 20, dasValor: '72,60' };

  saveState();
  showToast('Dados de exemplo carregados! ✨', 'success');
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
function filtrarMes(movs, anoMes) {
  return movs.filter(m => m.data && m.data.startsWith(anoMes));
}

// ===== DASHBOARD =====
function renderDashboard() {
  const mesAtual = getMesAtual();
  const movMes = filtrarMes(state.movimentacoes, mesAtual);

  const entradas = movMes.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0);
  const saidas   = movMes.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);
  const lucro = entradas - saidas;
  const saldoTotal = state.movimentacoes.filter(m=>m.tipo==='entrada').reduce((s,m)=>s+m.valor,0)
                   - state.movimentacoes.filter(m=>m.tipo==='saida').reduce((s,m)=>s+m.valor,0);

  const hoje = new Date();
  document.getElementById('dashSubtitle').textContent = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;

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
  const ultimas = [...state.movimentacoes]
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
  renderDashChart();
}

function renderDASInfo() {
  const dia = parseInt(state.config.dasDia) || 20;
  const hoje = new Date();
  const mesAtual = hoje.getMonth();
  const anoAtual = hoje.getFullYear();

  let venc = new Date(anoAtual, mesAtual, dia);
  if (venc < hoje) venc = new Date(anoAtual, mesAtual+1, dia);

  const diff = Math.ceil((venc - hoje) / (1000*60*60*24));
  const label = venc.toLocaleDateString('pt-BR', {day:'2-digit',month:'long'});

  document.getElementById('dasDate').textContent = `Dia ${dia} de cada mês`;
  document.getElementById('dasDays').textContent = `Próximo: ${label}`;

  const badge = document.getElementById('dasBadge');
  const alert = document.getElementById('dasAlert');

  if (diff < 0) {
    badge.className = 'badge-das danger'; badge.textContent = 'Vencido!';
    alert.className = 'das-alert danger';
    alert.innerHTML = `⚠️ <strong>DAS vencido!</strong> O DAS com vencimento dia ${dia} está vencido. Regularize sua situação.`;
    alert.style.display = 'flex';
  } else if (diff <= 7) {
    badge.className = 'badge-das warning'; badge.textContent = `${diff} dias`;
    alert.className = 'das-alert warning';
    alert.innerHTML = `🔔 <strong>DAS vence em ${diff} dia(s)!</strong> Não esqueça de pagar até o dia ${dia}.`;
    alert.style.display = 'flex';
  } else {
    badge.className = 'badge-das ok'; badge.textContent = `${diff} dias`;
    alert.style.display = 'none';
  }
}

function renderDashChart() {
  const ctx = document.getElementById('dashChart').getContext('2d');
  const today = new Date();
  const labels = [], dataE = [], dataS = [];

  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth()-i, 1);
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
        { label:'Entradas', data:dataE, backgroundColor:'rgba(15,157,88,.8)', borderRadius:6, barPercentage:.6 },
        { label:'Saídas',   data:dataS, backgroundColor:'rgba(229,57,53,.7)', borderRadius:6, barPercentage:.6 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ position:'top', labels:{font:{size:11},boxWidth:12} } },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:11}} },
        y: { grid:{color:'#f0f0f0'}, ticks:{font:{size:11}, callback: v => 'R$'+v.toLocaleString('pt-BR')} }
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
    document.getElementById('filtroMes').value = getMesAtual();
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
  if (date) document.getElementById('movData').value = date;
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

function excluirMov(id) {
  if (!confirm('Excluir esta movimentação?')) return;
  state.movimentacoes = state.movimentacoes.filter(m=>m.id!==id);
  saveState();
  showToast('Movimentação excluída.', 'error');
  renderPage(currentPage);
}

function salvarMovimentacao() {
  const desc  = document.getElementById('movDesc').value.trim();
  const valor = parseBRL(document.getElementById('movValor').value);
  const cat   = document.getElementById('movCategoria').value;
  const data  = document.getElementById('movData').value;
  const pag   = document.querySelector('input[name="pagamento"]:checked').value;
  const obs   = document.getElementById('movObs').value.trim();

  if (!desc) { showToast('Preencha a descrição.', 'error'); return; }
  if (!valor || valor <= 0) { showToast('Informe um valor válido.', 'error'); return; }
  if (!data) { showToast('Informe a data.', 'error'); return; }

  if (editingMovId) {
    const idx = state.movimentacoes.findIndex(m=>m.id===editingMovId);
    state.movimentacoes[idx] = { ...state.movimentacoes[idx], tipo:movTipo, desc, valor, cat, data, pag, obs };
    showToast('Movimentação atualizada! ✅');
  } else {
    state.movimentacoes.push({
      id: 'mov_' + Date.now(), tipo:movTipo, desc, valor, cat, data, pag, obs
    });
    showToast('Movimentação salva! ✅');
  }

  saveState();
  closeModal('modalMovimentacao');
  renderPage(currentPage);
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

function excluirCliente(id) {
  if (!confirm('Excluir este cliente?')) return;
  state.clientes = state.clientes.filter(c=>c.id!==id);
  saveState();
  showToast('Cliente excluído.', 'error');
  renderClientes();
}

function salvarCliente() {
  const nome  = document.getElementById('clienteNome').value.trim();
  const tel   = document.getElementById('clienteTel').value.trim();
  const email = document.getElementById('clienteEmail').value.trim();
  const obs   = document.getElementById('clienteObs').value.trim();

  if (!nome) { showToast('Informe o nome do cliente.', 'error'); return; }

  if (editingClienteId) {
    const idx = state.clientes.findIndex(c=>c.id===editingClienteId);
    state.clientes[idx] = { ...state.clientes[idx], nome, tel, email, obs };
    showToast('Cliente atualizado! ✅');
  } else {
    state.clientes.push({ id:'cli_'+Date.now(), nome, tel, email, obs });
    showToast('Cliente salvo! ✅');
  }

  saveState();
  closeModal('modalCliente');
  renderClientes();
}

// ===== RELATÓRIOS =====
function renderRelatorios() {
  const anoSel = document.getElementById('relatorioAno');
  const anos = [...new Set(state.movimentacoes.map(m=>m.data.split('-')[0]))].sort().reverse();
  const curAno = anoSel.value || String(new Date().getFullYear());
  if (!anoSel.innerHTML.includes(curAno)) {
    anoSel.innerHTML = anos.map(a=>`<option value="${a}" ${a===curAno?'selected':''}>${a}</option>`).join('');
  }
  anoSel.value = curAno;

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
        { label:'Entradas', data:dataE, backgroundColor:'rgba(15,157,88,.8)', borderRadius:6, barPercentage:.65 },
        { label:'Saídas',   data:dataS, backgroundColor:'rgba(229,57,53,.7)', borderRadius:6, barPercentage:.65 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'top',labels:{font:{size:11},boxWidth:12}} },
      scales:{
        x:{grid:{display:false},ticks:{font:{size:11}}},
        y:{grid:{color:'#f0f0f0'},ticks:{font:{size:11},callback:v=>'R$'+v.toLocaleString('pt-BR')}}
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
  document.getElementById('cfgDasDia').value   = state.config.dasDia || 20;
  document.getElementById('cfgDasValor').value = state.config.dasValor || '72,60';
  updateDasPreview();
  updateSidebarUser();
}

function salvarConfig() {
  state.config.nome = document.getElementById('cfgNome').value.trim() || 'Meu MEI';
  state.config.cnpj = document.getElementById('cfgCnpj').value.trim();
  state.config.ramo = document.getElementById('cfgRamo').value.trim();
  saveState();
  updateSidebarUser();
  showToast('Configurações salvas! ✅');
}

function salvarDAS() {
  const dia   = parseInt(document.getElementById('cfgDasDia').value) || 20;
  const valor = document.getElementById('cfgDasValor').value.trim();
  if (dia < 1 || dia > 31) { showToast('Dia inválido (1-31).', 'error'); return; }
  state.config.dasDia   = dia;
  state.config.dasValor = valor;
  saveState();
  updateDasPreview();
  showToast('Lembrete do DAS configurado! ✅');
}

function updateDasPreview() {
  const dia = parseInt(document.getElementById('cfgDasDia').value) || 20;
  const hoje = new Date();
  let venc = new Date(hoje.getFullYear(), hoje.getMonth(), dia);
  if (venc < hoje) venc = new Date(hoje.getFullYear(), hoje.getMonth()+1, dia);
  const diff = Math.ceil((venc - hoje)/(1000*60*60*24));

  const prev = document.getElementById('dasPreview');
  if (diff < 0) {
    prev.className='das-preview danger'; prev.textContent=`⚠️ DAS vencido! Regularize já.`;
  } else if (diff <= 7) {
    prev.className='das-preview warning'; prev.textContent=`⏰ DAS vence em ${diff} dia(s)!`;
  } else {
    prev.className='das-preview ok'; prev.textContent=`✅ DAS configurado. Vence em ${diff} dias.`;
  }
}

function updateSidebarUser() {
  const nome = state.config.nome || 'Meu MEI';
  document.querySelectorAll('.user-name').forEach(el=>el.textContent=nome);
  document.querySelectorAll('.user-avatar').forEach(el=>el.textContent=nome.charAt(0).toUpperCase());
}

function restaurarExemplos() {
  if (!confirm('Isso substituirá todos os dados pelos exemplos. Continuar?')) return;
  localStorage.removeItem('fluxmei_v1');
  criarDadosExemplo();
  renderPage(currentPage);
}

function limparTudo() {
  if (!confirm('Apagar TODOS os dados? Esta ação não pode ser desfeita.')) return;
  state = { movimentacoes:[], clientes:[], config:{ nome:'Meu MEI', cnpj:'', ramo:'', dasDia:20, dasValor:'72,60' } };
  saveState();
  showToast('Todos os dados foram apagados.', 'error');
  renderPage(currentPage);
}

// ===== ESCAPE =====
function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== INIT =====
function init() {
  loadState();

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

  // Filters
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
