import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  createCliente,
  deleteCliente,
  getCliente,
  listClientes,
  updateCliente
} from '../controllers/clienteController.js';

const router = Router();

router.use(authMiddleware);
router.use(checkSubscriptionAccess);
router.post('/', asyncHandler(createCliente));
router.get('/', asyncHandler(listClientes));
router.get('/:id', asyncHandler(getCliente));
router.put('/:id', asyncHandler(updateCliente));
router.delete('/:id', asyncHandler(deleteCliente));

export default router;
