import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { paymentRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import {
  criarBoletoAsaas,
  criarCartaoAsaas,
  criarPixAsaas,
  historicoPagamentos,
  statusPagamentoAsaas,
  statusPagamentoEfi
} from '../controllers/pagamentoController.js';
import {
  criarBoleto as criarBoletoEfi,
  criarCartao as criarCartaoEfi,
  criarPix as criarPixEfi
} from '../controllers/efiController.js';

const router = Router();

router.get('/historico', authMiddleware, asyncHandler(historicoPagamentos));

router.post('/asaas/criar-pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixAsaas));
router.post('/asaas/criar-boleto', paymentRateLimiter, authMiddleware, asyncHandler(criarBoletoAsaas));
router.post('/asaas/criar-cartao', paymentRateLimiter, authMiddleware, asyncHandler(criarCartaoAsaas));
router.get('/asaas/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoAsaas));

router.post('/efi/criar-pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixEfi));
router.post('/efi/criar-cartao', paymentRateLimiter, authMiddleware, asyncHandler(criarCartaoEfi));
router.post('/efi/criar-boleto', paymentRateLimiter, authMiddleware, asyncHandler(criarBoletoEfi));
router.post('/efi/pix', paymentRateLimiter, authMiddleware, asyncHandler(criarPixEfi));
router.post('/efi/cartao', paymentRateLimiter, authMiddleware, asyncHandler(criarCartaoEfi));
router.post('/efi/boleto', paymentRateLimiter, authMiddleware, asyncHandler(criarBoletoEfi));
router.get('/efi/status/:paymentId', paymentRateLimiter, authMiddleware, asyncHandler(statusPagamentoEfi));

export default router;
