import { Router } from 'express';
import { isAsaasEnabled } from '../config/features.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { paymentRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import {
  criarCobrancaAsaas,
  criarCheckoutMercadoPago,
  criarPixMercadoPago,
  mercadoPagoPublicConfig,
  processarPagamentoBrick,
  statusPagamentoAsaas,
  sincronizarRetornoMercadoPago,
  statusPagamentoMercadoPago
} from '../controllers/pagamentoController.js';

const router = Router();

router.post('/mercado-pago/criar-checkout', paymentRateLimiter, authMiddleware, asyncHandler(criarCheckoutMercadoPago));
router.get('/mercado-pago/public-config', asyncHandler(mercadoPagoPublicConfig));
router.post('/mercado-pago/criar-pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixMercadoPago));
router.post('/mercado-pago/processar-brick', paymentRateLimiter, authMiddleware, asyncHandler(processarPagamentoBrick));
router.get('/mercado-pago/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoMercadoPago));
router.get('/mercado-pago/sincronizar', paymentRateLimiter, authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));
router.post('/mercado-pago/sincronizar', paymentRateLimiter, authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));

if (isAsaasEnabled()) {
  router.post('/asaas/criar-cobranca', paymentRateLimiter, authMiddleware, asyncHandler(criarCobrancaAsaas));
  router.get('/asaas/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoAsaas));
} else {
  console.info('[routes] Rotas publicas Asaas desativadas por ENABLE_ASAAS=false.');
}

export default router;
