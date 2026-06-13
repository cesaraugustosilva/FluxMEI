const header = document.querySelector('[data-header]');
const menuToggle = document.querySelector('[data-menu-toggle]');
const nav = document.querySelector('[data-nav]');
const TOKEN_KEY = 'fluxmei_access_token';
const INTENT_KEY = 'fluxmei_intent';
const PLAN_KEY = 'fluxmei_subscribe_plan';
const SUBSCRIBE_INTENT = 'subscribe';
const DEFAULT_PLAN = 'pro_mensal';

function updateHeaderState() {
  header?.classList.toggle('is-scrolled', window.scrollY > 18);
}

// Mobile menu: keep it tiny and dependency-free for GitHub Pages.
menuToggle?.addEventListener('click', () => {
  const isOpen = document.body.classList.toggle('menu-open');
  menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
});

nav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    document.body.classList.remove('menu-open');
    menuToggle?.setAttribute('aria-label', 'Abrir menu');
  });
});

function showLandingAlert(message, type = 'error') {
  const alert = document.querySelector('[data-landing-alert]');
  if (!alert) return;

  alert.textContent = message;
  alert.className = `landing-alert show ${type}`;
}

function getPaymentUrl(plan = DEFAULT_PLAN) {
  const url = new URL('../checkout/', window.location.href);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', plan);
  return url.href;
}

function getRegisterUrl(plan = DEFAULT_PLAN) {
  const url = new URL('../auth/cadastro/index.html', window.location.href);
  url.searchParams.set('intent', SUBSCRIBE_INTENT);
  url.searchParams.set('plan', plan);
  return url.href;
}

function saveSubscribeIntent(plan = DEFAULT_PLAN) {
  localStorage.setItem(INTENT_KEY, SUBSCRIBE_INTENT);
  localStorage.setItem(PLAN_KEY, plan);
}

function getStoredToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

function handleSubscribeClick(event) {
  const button = event.currentTarget;
  const plan = button.dataset.subscribePlan || DEFAULT_PLAN;
  saveSubscribeIntent(plan);

  if (getStoredToken()) {
    button.disabled = true;
    button.textContent = 'Abrindo checkout...';
    window.location.href = getPaymentUrl(plan);
    return;
  }

  showLandingAlert('Crie sua conta ou entre para continuar a assinatura com segurança.', 'success');
  window.location.href = getRegisterUrl(plan);
}

function bindConversionLinks() {
  document.querySelectorAll('[data-trial-link]').forEach((link) => {
    link.addEventListener('click', () => {
      localStorage.removeItem(INTENT_KEY);
      localStorage.removeItem(PLAN_KEY);
    });
  });

  document.querySelectorAll('[data-subscribe-plan]').forEach((button) => {
    button.addEventListener('click', handleSubscribeClick);
  });
}

window.addEventListener('scroll', updateHeaderState, { passive: true });
updateHeaderState();
bindConversionLinks();

// Scroll reveal with graceful fallback for older browsers.
const revealItems = document.querySelectorAll('.reveal');

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealItems.forEach((item) => observer.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add('is-visible'));
}
