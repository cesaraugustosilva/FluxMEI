import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { webhookMercadoPago } from '../controllers/pagamentoController.js';

const router = Router();

router.post('/mercado-pago', asyncHandler(webhookMercadoPago));

export default router;
