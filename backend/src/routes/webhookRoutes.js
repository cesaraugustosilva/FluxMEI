import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { receberWebhook as webhookEfi } from '../controllers/efiController.js';

const router = Router();

router.post('/efi', asyncHandler(webhookEfi));

export default router;
