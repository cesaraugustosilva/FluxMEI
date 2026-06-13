import { Router } from 'express';
import { isAsaasEnabled } from '../config/features.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
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

router.post('/mercado-pago/criar-checkout', authMiddleware, asyncHandler(criarCheckoutMercadoPago));
router.get('/mercado-pago/public-config', asyncHandler(mercadoPagoPublicConfig));
router.post('/mercado-pago/criar-pix', authMiddleware, asyncHandler(criarPixMercadoPago));
router.post('/mercado-pago/processar-brick', authMiddleware, asyncHandler(processarPagamentoBrick));
router.get('/mercado-pago/status/:paymentId', authMiddleware, asyncHandler(statusPagamentoMercadoPago));
router.get('/mercado-pago/sincronizar', authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));
router.post('/mercado-pago/sincronizar', authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));

if (isAsaasEnabled()) {
  router.post('/asaas/criar-cobranca', authMiddleware, asyncHandler(criarCobrancaAsaas));
  router.get('/asaas/status/:paymentId', authMiddleware, asyncHandler(statusPagamentoAsaas));
} else {
  console.info('[routes] Rotas publicas Asaas desativadas por ENABLE_ASAAS=false.');
}

export default router;
