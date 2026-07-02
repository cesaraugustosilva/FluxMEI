import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const assetsDir = path.join(frontendDir, 'assets');
const imageExtPattern = /\.(png|jpe?g|svg|webp|ico)(?:[?#][^"')\s]*)?$/i;
const sourceExts = new Set(['.html', '.css', '.js', '.json', '.md']);
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico']);
const expectedAssets = [
  'brand/logo-fluxmei.png',
  'brand/icon-fluxmei.png',
  'brand/favicon.png',
  'brand/favicon.ico',
  'brand/apple-touch-icon.png',
  'brand/icon-192.png',
  'checkout/checkout-logo.png',
  'landing/landing-icon-fluxmei.png',
  'social/open-graph/og-image.png'
];

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') {
        return [];
      }
      return walk(fullPath, predicate);
    }

    return predicate(fullPath) ? [fullPath] : [];
  });
}

function sourceFiles() {
  const docs = ['README.md', 'DEPLOY.md']
    .map((file) => path.join(rootDir, file))
    .filter((file) => fs.existsSync(file));

  return [
    ...walk(frontendDir, (file) => sourceExts.has(path.extname(file))),
    ...walk(path.join(rootDir, 'tests'), (file) => sourceExts.has(path.extname(file))),
    ...docs
  ];
}

function stripUrlDecorators(value) {
  return value.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
}

function resolveImageReference(fromFile, rawValue) {
  const value = stripUrlDecorators(rawValue);

  if (!value || value.startsWith('data:')) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.hostname !== 'fluxmei.com.br') {
      return null;
    }
    return path.join(frontendDir, decodeURIComponent(url.pathname));
  }

  if (value.startsWith('/')) {
    return path.join(frontendDir, decodeURIComponent(value.slice(1)));
  }

  return path.resolve(path.dirname(fromFile), decodeURIComponent(value));
}

function collectImageReferences(file) {
  const content = fs.readFileSync(file, 'utf8');
  const refs = [];
  const attrPattern = /\b(?:src|href|content)\s*=\s*["']([^"']+)["']/gi;
  const cssUrlPattern = /url\(\s*([^)]*?)\s*\)/gi;
  const jsonSrcPattern = /"src"\s*:\s*"([^"]+)"/gi;

  for (const pattern of [attrPattern, cssUrlPattern, jsonSrcPattern]) {
    for (const match of content.matchAll(pattern)) {
      const value = stripUrlDecorators(match[1]);
      if (imageExtPattern.test(value)) {
        refs.push({ file, value });
      }
    }
  }

  return refs;
}

test('referencias de imagens locais apontam para arquivos existentes', () => {
  const refs = sourceFiles().flatMap(collectImageReferences);
  const broken = refs
    .map((ref) => ({ ...ref, resolved: resolveImageReference(ref.file, ref.value) }))
    .filter((ref) => ref.resolved && !fs.existsSync(ref.resolved));

  assert.deepEqual(
    broken.map((ref) => `${path.relative(rootDir, ref.file)} -> ${ref.value}`),
    []
  );
});

test('codigo nao referencia pastas antigas de imagens', () => {
  const legacyFolder = ['Imagens', 'FluxMEI'].join(' ');
  const offenders = sourceFiles().filter((file) => fs.readFileSync(file, 'utf8').includes(legacyFolder));

  assert.deepEqual(offenders.map((file) => path.relative(rootDir, file)), []);
});

test('assets publicos ficam em frontend/assets e usam nomes seguros', () => {
  const frontendImages = walk(frontendDir, (file) => imageExts.has(path.extname(file).toLowerCase()));
  const outsideAssets = frontendImages.filter((file) => !path.relative(assetsDir, file).startsWith('..'));
  const misplaced = frontendImages.filter((file) => path.relative(assetsDir, file).startsWith('..'));
  const unsafeNames = frontendImages.filter((file) => {
    const relative = path.relative(assetsDir, file).split(path.sep);
    return relative.some((part) => !/^[a-z0-9._-]+$/.test(part));
  });

  assert.ok(outsideAssets.length > 0);
  assert.deepEqual(misplaced.map((file) => path.relative(rootDir, file)), []);
  assert.deepEqual(unsafeNames.map((file) => path.relative(rootDir, file)), []);
});

test('estrutura publica de assets do FluxMEI esta completa', () => {
  const missing = expectedAssets.filter((asset) => !fs.existsSync(path.join(assetsDir, asset)));

  assert.deepEqual(missing, []);
});

test('paginas principais usam os assets reais da marca', () => {
  const expectedReferences = new Map([
    ['frontend/landing-page/index.html', ['/assets/brand/icon-fluxmei.png', '/assets/landing/landing-icon-fluxmei.png']],
    ['frontend/auth/login/index.html', ['../../assets/brand/logo-fluxmei.png']],
    ['frontend/auth/cadastro/index.html', ['../../assets/brand/logo-fluxmei.png']],
    ['frontend/auth/recovery/esqueceu-senha.html', ['../../assets/brand/icon-fluxmei.png']],
    ['frontend/auth/recovery/nova-senha.html', ['../../assets/brand/icon-fluxmei.png']],
    ['frontend/app/index.html', ['/assets/brand/icon-fluxmei.png']],
    ['frontend/admin/index.html', ['/assets/brand/icon-fluxmei.png']],
    ['frontend/checkout/index.html', ['/assets/checkout/checkout-logo.png']]
  ]);
  const missing = [];

  for (const [relativeFile, references] of expectedReferences) {
    const content = fs.readFileSync(path.join(rootDir, relativeFile), 'utf8');
    for (const reference of references) {
      if (!content.includes(reference)) {
        missing.push(`${relativeFile} -> ${reference}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
