import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  criarCheckoutMercadoPago,
  mercadoPagoPublicConfig,
  processarPagamentoBrick,
  sincronizarRetornoMercadoPago,
  statusPagamentoMercadoPago
} from '../controllers/pagamentoController.js';

const router = Router();

router.post('/mercado-pago/criar-checkout', authMiddleware, asyncHandler(criarCheckoutMercadoPago));
router.get('/mercado-pago/public-config', asyncHandler(mercadoPagoPublicConfig));
router.post('/mercado-pago/processar-brick', authMiddleware, asyncHandler(processarPagamentoBrick));
router.get('/mercado-pago/status/:paymentId', authMiddleware, asyncHandler(statusPagamentoMercadoPago));
router.get('/mercado-pago/sincronizar', authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));
router.post('/mercado-pago/sincronizar', authMiddleware, asyncHandler(sincronizarRetornoMercadoPago));

export default router;
