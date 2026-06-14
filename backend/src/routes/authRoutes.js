import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorMiddleware.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { authRateLimiter, passwordResetRateLimiter, registerRateLimiter } from '../middlewares/rateLimitMiddleware.js';
import { login, logout, me, register, resetPassword, updatePassword, updateProfile } from '../controllers/authController.js';

const router = Router();

router.post('/register', registerRateLimiter, asyncHandler(register));
router.post('/login', authRateLimiter, asyncHandler(login));
router.post('/logout', authMiddleware, asyncHandler(logout));
router.get('/me', authMiddleware, asyncHandler(me));
router.put('/me/profile', authMiddleware, asyncHandler(updateProfile));
router.post('/reset-password', passwordResetRateLimiter, asyncHandler(resetPassword));
router.post('/update-password', passwordResetRateLimiter, authMiddleware, asyncHandler(updatePassword));

export default router;
