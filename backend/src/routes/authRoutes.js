import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { login, logout, me, register, resetPassword, updatePassword, updateProfile } from '../controllers/authController.js';

const router = Router();

router.post('/register', asyncHandler(register));
router.post('/login', asyncHandler(login));
router.post('/logout', authMiddleware, asyncHandler(logout));
router.get('/me', authMiddleware, asyncHandler(me));
router.put('/me/profile', authMiddleware, asyncHandler(updateProfile));
router.post('/reset-password', asyncHandler(resetPassword));
router.post('/update-password', authMiddleware, asyncHandler(updatePassword));

export default router;
