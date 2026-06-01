import { writeFileSync } from 'node:fs';

const apiUrl = process.env.FLUXMEI_API_URL;

if (!apiUrl) {
  throw new Error('FLUXMEI_API_URL nao configurada.');
}

writeFileSync(
  'env.js',
  `window.FLUXMEI_CONFIG = ${JSON.stringify({
    API_URL: apiUrl.replace(/\/$/, '')
  })};\n`
);
