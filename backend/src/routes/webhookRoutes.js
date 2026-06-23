import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { receberWebhook as webhookEfi } from '../controllers/efiController.js';
import { webhookAsaas } from '../controllers/pagamentoController.js';

const router = Router();

router.post('/asaas', asyncHandler(webhookAsaas));
router.post('/efi', asyncHandler(webhookEfi));

export default router;
