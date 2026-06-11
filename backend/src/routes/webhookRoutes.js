import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { webhookAsaas, webhookMercadoPago } from '../controllers/pagamentoController.js';

const router = Router();

router.post('/mercado-pago', asyncHandler(webhookMercadoPago));
router.post('/asaas', asyncHandler(webhookAsaas));

export default router;
