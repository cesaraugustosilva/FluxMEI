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
import assinaturaRoutes from './routes/assinaturaRoutes.js';
import pagamentoRoutes from './routes/pagamentoRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import devRoutes from './routes/devRoutes.js';
import { logLegacyFeatureStatus } from './config/features.js';
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
logLegacyFeatureStatus();

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://sdk.mercadopago.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameSrc: ["'self'", 'https://*.mercadopago.com', 'https://*.mercadopago.com.br'],
      connectSrc: ["'self'", 'https://*.supabase.co', 'https://generativelanguage.googleapis.com', 'https://api.mercadopago.com', 'https://*.mercadopago.com', 'https://*.efipay.com.br']
    }
  }
}));
const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean)
  : [];

function isDevOrigin(origin) {
  if (!origin) return true;
  if (origin === 'null') return true;

  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1'].includes(url.hostname);
  } catch {
    return false;
  }
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalizedOrigin = origin ? origin.replace(/\/$/, '') : origin;
    if (allowedOrigins.includes(normalizedOrigin) || (!isProduction && isDevOrigin(origin))) {
      return callback(null, true);
    }
    return callback(new Error('Origem bloqueada pelo CORS.'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
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
apiRouter.use('/assinaturas', assinaturaRoutes);
apiRouter.use('/pagamentos', pagamentoRoutes);
apiRouter.use('/webhooks', webhookRoutes);
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
  app.use('/assinaturas', assinaturaRoutes);
  app.use('/pagamentos', pagamentoRoutes);
  app.use('/webhooks', webhookRoutes);
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
