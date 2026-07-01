import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { writeEnvFile } from './write-env.js';

const frontendDir = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.FRONTEND_PORT || 5173);
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

writeEnvFile();

function resolvePath(url = '/') {
  const pathname = decodeURIComponent(new URL(url, `http://localhost:${port}`).pathname);
  const requested = pathname === '/' ? '/index.html' : pathname;
  const fullPath = normalize(join(frontendDir, requested));
  if (!fullPath.startsWith(frontendDir)) return null;
  if (existsSync(fullPath)) {
    if (statSync(fullPath).isDirectory()) {
      const indexPath = join(fullPath, 'index.html');
      return existsSync(indexPath) ? indexPath : null;
    }
    return fullPath;
  }
  return null;
}

createServer((req, res) => {
  const filePath = resolvePath(req.url);
  if (!filePath) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream' });
  createReadStream(filePath).pipe(res);
}).listen(port, () => {
  console.log(`FluxMEI frontend: http://localhost:${port}`);
});
