import { Router } from 'express';
import { isAsaasEnabled } from '../config/features.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { paymentRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import {
  checkoutMercadoPagoLegadoDesativado,
  criarCobrancaAsaas,
  criarBoletoEfi,
  criarCartaoEfi,
  criarPixEfi,
  criarPixMercadoPago,
  mercadoPagoPublicConfig,
  processarPagamentoBrick,
  statusPagamentoAsaas,
  statusPagamentoEfi,
  sincronizarRetornoMercadoPago,
  statusPagamentoMercadoPago
} from '../controllers/pagamentoController.js';
import {
  criarBoleto as criarBoletoEfiCurto,
  criarCartao as criarCartaoEfiCurto,
  criarPix as criarPixEfiCurto
} from '../controllers/efiController.js';

const router = Router();

router.post('/mercado-pago/criar-checkout', asyncHandler(checkoutMercadoPagoLegadoDesativado));
router.get('/mercado-pago/public-config', asyncHandler(mercadoPagoPublicConfig));
router.post('/mercado-pago/criar-pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixMercadoPago));
router.post('/mercado-pago/processar-brick', paymentRateLimiter, authMiddleware, asyncHandler(processarPagamentoBrick));
router.get('/mercado-pago/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoMercadoPago));
router.get('/mercado-pago/sincronizar', paymentRateLimiter, authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));
router.post('/mercado-pago/sincronizar', paymentRateLimiter, authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));

router.post('/efi/criar-pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixEfi));
router.post('/efi/criar-cartao', paymentRateLimiter, authMiddleware, asyncHandler(criarCartaoEfi));
router.post('/efi/criar-boleto', paymentRateLimiter, authMiddleware, asyncHandler(criarBoletoEfi));
router.post('/efi/pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixEfiCurto));
router.post('/efi/cartao', paymentRateLimiter, authMiddleware, asyncHandler(criarCartaoEfiCurto));
router.post('/efi/boleto', paymentRateLimiter, authMiddleware, asyncHandler(criarBoletoEfiCurto));
router.get('/efi/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoEfi));

if (isAsaasEnabled()) {
  router.post('/asaas/criar-cobranca', paymentRateLimiter, authMiddleware, asyncHandler(criarCobrancaAsaas));
  router.get('/asaas/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoAsaas));
} else {
  console.info('[routes] Rotas publicas Asaas desativadas por ENABLE_ASAAS=false.');
}

export default router;
