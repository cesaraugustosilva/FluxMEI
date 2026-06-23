import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.FLUXMEI_API_URL;
const paymentGateway = process.env.PAYMENT_GATEWAY || process.env.FLUXMEI_PAYMENT_GATEWAY || 'asaas';
const efiPayeeCode = process.env.FLUXMEI_EFI_PAYEE_CODE || '';
const efiEnvironment = process.env.FLUXMEI_EFI_ENVIRONMENT || process.env.EFI_ENVIRONMENT || '';

if (!apiUrl) {
  throw new Error('FLUXMEI_API_URL nao configurada.');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const envPath = resolve(frontendDir, 'env.js');

writeFileSync(
  envPath,
  `window.FLUXMEI_CONFIG = ${JSON.stringify({
    API_URL: apiUrl.replace(/\/$/, ''),
    PAYMENT_GATEWAY: paymentGateway,
    EFI_PAYEE_CODE: efiPayeeCode,
    EFI_ENVIRONMENT: efiEnvironment
  })};\n`
);
