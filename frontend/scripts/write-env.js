import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const apiUrl = process.env.FLUXMEI_API_URL;

if (!apiUrl) {
  throw new Error('FLUXMEI_API_URL nao configurada.');
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = resolve(scriptDir, '..');
const envPath = resolve(frontendDir, 'env.js');

writeFileSync(
  envPath,
  `window.FLUXMEI_CONFIG = ${JSON.stringify({
    API_URL: apiUrl.replace(/\/$/, '')
  })};\n`
);
