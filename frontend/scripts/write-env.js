import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEV_API_URL = 'http://localhost:3002/api';
const PUBLIC_CONFIG_KEYS = ['API_URL', 'PAYMENT_GATEWAY', 'EFI_PAYEE_CODE', 'EFI_ENVIRONMENT'];

function isProductionEnv(env = process.env) {
  return env.NODE_ENV === 'production' || env.VERCEL === '1';
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const envPath = resolve(frontendDir, 'env.js');

export function buildPublicConfig(env = process.env) {
  const apiUrl = env.FLUXMEI_API_URL || (isProductionEnv(env) ? '' : DEV_API_URL);

  if (!apiUrl) {
    throw new Error('FLUXMEI_API_URL obrigatoria em producao/Vercel. Configure a variavel na Vercel antes do build.');
  }

  return {
    API_URL: apiUrl.replace(/\/$/, ''),
    PAYMENT_GATEWAY: env.FLUXMEI_PAYMENT_GATEWAY || env.PAYMENT_GATEWAY || 'asaas',
    EFI_PAYEE_CODE: env.FLUXMEI_EFI_PAYEE_CODE || '',
    EFI_ENVIRONMENT: env.FLUXMEI_EFI_ENVIRONMENT || env.EFI_ENVIRONMENT || ''
  };
}

export function serializePublicConfig(config) {
  const publicConfig = Object.fromEntries(
    PUBLIC_CONFIG_KEYS.map((key) => [key, config[key] || ''])
  );

  return `window.FLUXMEI_CONFIG = ${JSON.stringify(publicConfig)};\n`;
}

export function writeEnvFile({ env = process.env, outputPath = envPath } = {}) {
  const config = buildPublicConfig(env);
  writeFileSync(outputPath, serializePublicConfig(config));
  return config;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) writeEnvFile();
