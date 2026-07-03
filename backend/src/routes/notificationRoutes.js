import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  markRead,
  notifications,
  readAll,
  unreadCount
} from '../controllers/notificationController.js';

const router = Router();

router.use(authMiddleware);
router.get('/', asyncHandler(notifications));
router.get('/unread-count', asyncHandler(unreadCount));
router.post('/:id/read', asyncHandler(markRead));
router.post('/read-all', asyncHandler(readAll));

export default router;
