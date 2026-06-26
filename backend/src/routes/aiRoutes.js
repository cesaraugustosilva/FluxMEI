import { Router } from 'express';
import { authMiddleware, checkSubscriptionAccess } from '../middlewares/authMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import {
  aiChat,
  aiInsights,
  deleteAiConversation,
  getAiConversation,
  listAiConversations,
  renameAiConversation
} from '../controllers/aiController.js';

const router = Router();

router.use(authMiddleware);
router.use(checkSubscriptionAccess);

router.get('/insights', asyncHandler(aiInsights));
router.get('/conversations', asyncHandler(listAiConversations));
router.get('/conversations/:id', asyncHandler(getAiConversation));
router.post('/chat', asyncHandler(aiChat));
router.patch('/conversations/:id', asyncHandler(renameAiConversation));
router.delete('/conversations/:id', asyncHandler(deleteAiConversation));

export default router;
