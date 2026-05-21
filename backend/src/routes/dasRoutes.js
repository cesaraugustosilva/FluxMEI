import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { createDas, deleteDas, listDas, pagarDas, updateDas } from '../controllers/dasController.js';

const router = Router();

router.use(authMiddleware);
router.post('/', asyncHandler(createDas));
router.get('/', asyncHandler(listDas));
router.put('/:id', asyncHandler(updateDas));
router.delete('/:id', asyncHandler(deleteDas));
router.patch('/:id/pagar', asyncHandler(pagarDas));

export default router;
