import './env.js';

export function isAsaasEnabled() {
  return process.env.ENABLE_ASAAS === 'true';
}

export function logLegacyFeatureStatus() {
  if (isAsaasEnabled()) {
    console.warn('[features] Asaas legado habilitado por ENABLE_ASAAS=true.');
    return;
  }

  console.info('[features] Asaas legado desativado. Use ENABLE_ASAAS=true somente para fallback tecnico controlado.');
}
