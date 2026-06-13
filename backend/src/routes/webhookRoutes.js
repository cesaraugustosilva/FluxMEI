import { Router } from 'express';
import { isAsaasEnabled } from '../config/features.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { webhookAsaas, webhookMercadoPago } from '../controllers/pagamentoController.js';

const router = Router();

router.post('/mercado-pago', asyncHandler(webhookMercadoPago));

if (isAsaasEnabled()) {
  router.post('/asaas', asyncHandler(webhookAsaas));
} else {
  router.post('/asaas', (req, res) => {
    console.info('[webhook:asaas] recebido enquanto Asaas legado esta desativado.');
    res.status(410).json({
      error: 'Webhook Asaas desativado.',
      code: 'ASAAS_DISABLED'
    });
  });
}

export default router;
