import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import authRoutes from './routes/authRoutes.js';
import movimentacaoRoutes from './routes/movimentacaoRoutes.js';
import clienteRoutes from './routes/clienteRoutes.js';
import dasRoutes from './routes/dasRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import calendarioRoutes from './routes/calendarioRoutes.js';
import relatorioRoutes from './routes/relatorioRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import assinaturaRoutes from './routes/assinaturaRoutes.js';
import pagamentoRoutes from './routes/pagamentoRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import couponRoutes from './routes/couponRoutes.js';
import referralRoutes from './routes/referralRoutes.js';
import exportRoutes from './routes/exportRoutes.js';
import importRoutes from './routes/importRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import devRoutes from './routes/devRoutes.js';
import { planos } from './controllers/assinaturaController.js';
import { asyncHandler, errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';
import { checkPaymentWebhookConfiguration } from './services/webhookSecurityService.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', '..', 'frontend');
const envFile = process.env.FLUXMEI_ENV_FILE || path.resolve(__dirname, '..', '.env');

dotenv.config({ path: envFile });
checkPaymentWebhookConfiguration();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameSrc: ["'self'"],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://generativelanguage.googleapis.com', 'https://*.efipay.com.br']
    }
  }
}));
const isProduction = process.env.NODE_ENV === 'production';
const OFFICIAL_FRONTEND_ORIGINS = [
  'https://fluxmei.com.br',
  'https://www.fluxmei.com.br'
];

export function normalizeCorsOrigin(origin) {
  if (!origin || typeof origin !== 'string') return '';
  return origin.trim().replace(/\/+$/, '');
}

function normalizeConfiguredOrigin(origin) {
  const normalized = normalizeCorsOrigin(origin);
  if (!normalized) return '';

  try {
    return normalizeCorsOrigin(new URL(normalized).origin);
  } catch {
    try {
      return normalizeCorsOrigin(new URL(`https://${normalized}`).origin);
    } catch {
      return '';
    }
  }
}

function splitOriginList(value) {
  return String(value || '')
    .split(',')
    .map(normalizeConfiguredOrigin)
    .filter(Boolean);
}

export function getAllowedCorsOrigins(env = process.env) {
  const configuredOrigins = [
    ...splitOriginList(env.FRONTEND_URL),
    ...splitOriginList(env.VERCEL_URL)
  ];

  return [...new Set([
    ...OFFICIAL_FRONTEND_ORIGINS,
    ...configuredOrigins
  ])];
}

export function isDevOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return true;

  try {
    const url = new URL(normalizeCorsOrigin(origin));
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function isCorsOriginAllowed(origin, env = process.env) {
  if (!origin) return { allowed: true, allowedOrigins: getAllowedCorsOrigins(env), normalizedOrigin: '' };

  const normalizedOrigin = normalizeCorsOrigin(origin);
  const allowedOrigins = getAllowedCorsOrigins(env);
  const production = env.NODE_ENV === 'production';

  return {
    allowed: allowedOrigins.includes(normalizedOrigin) || (!production && isDevOrigin(normalizedOrigin)),
    allowedOrigins,
    normalizedOrigin
  };
}

app.use(cors({
  origin(origin, callback) {
    const corsCheck = isCorsOriginAllowed(origin);
    if (corsCheck.allowed) {
      return callback(null, true);
    }

    console.warn('Origem bloqueada pelo CORS.', {
      origin: corsCheck.normalizedOrigin || origin || '',
      allowedOrigins: corsCheck.allowedOrigins
    });

    return callback(new Error('Origem bloqueada pelo CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '4mb' }));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false
}));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FluxMEI API' });
});

app.use(express.static(publicDir, {
  extensions: ['html'],
  index: 'index.html'
}));

const apiRouter = express.Router();

apiRouter.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'FluxMEI API' });
});

apiRouter.use('/auth', authRoutes);
apiRouter.use('/movimentacoes', movimentacaoRoutes);
apiRouter.use('/clientes', clienteRoutes);
apiRouter.use('/das', dasRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/calendario', calendarioRoutes);
apiRouter.use('/relatorios', relatorioRoutes);
apiRouter.use('/ai', aiRoutes);
apiRouter.use('/assinaturas', assinaturaRoutes);
apiRouter.use('/pagamentos', pagamentoRoutes);
apiRouter.use('/webhooks', webhookRoutes);
apiRouter.use('/admin', adminRoutes);
apiRouter.use('/coupons', couponRoutes);
apiRouter.use('/referrals', referralRoutes);
apiRouter.use('/export', exportRoutes);
apiRouter.use('/import', importRoutes);
apiRouter.use('/notifications', notificationRoutes);
if (!isProduction) apiRouter.use('/dev', devRoutes);
apiRouter.get('/planos', asyncHandler(planos));

app.use('/api', apiRouter);

if (!isProduction) {
  app.use('/auth', authRoutes);
  app.use('/movimentacoes', movimentacaoRoutes);
  app.use('/clientes', clienteRoutes);
  app.use('/das', dasRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/calendario', calendarioRoutes);
  app.use('/relatorios', relatorioRoutes);
  app.use('/ai', aiRoutes);
  app.use('/assinaturas', assinaturaRoutes);
  app.use('/pagamentos', pagamentoRoutes);
  app.use('/webhooks', webhookRoutes);
  app.use('/import', importRoutes);
  app.use('/notifications', notificationRoutes);
  app.use('/dev', devRoutes);
  app.get('/planos', asyncHandler(planos));
}

app.get('*', (req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use(notFoundHandler);
app.use(errorHandler);

export function startServer(port = process.env.PORT || 3002, onListening) {
  return app.listen(port, () => {
    console.log(`FluxMEI API rodando na porta ${port}`);
    if (onListening) onListening();
  });
}

export { app };

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) startServer();
