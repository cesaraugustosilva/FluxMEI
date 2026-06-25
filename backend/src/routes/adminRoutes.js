import { Router } from 'express';
import {
  adminAuditLogs,
  adminDashboard,
  adminPayments,
  adminSubscriptions,
  adminUsers
} from '../controllers/adminController.js';
import {
  createCoupon,
  listCoupons,
  updateCoupon
} from '../controllers/couponController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { adminMiddleware } from '../middlewares/adminMiddleware.js';
import { asyncHandler } from '../middlewares/errorMiddleware.js';

const router = Router();

router.use(authMiddleware, adminMiddleware);

router.get('/dashboard', asyncHandler(adminDashboard));
router.get('/users', asyncHandler(adminUsers));
router.get('/subscriptions', asyncHandler(adminSubscriptions));
router.get('/payments', asyncHandler(adminPayments));
router.get('/audit-logs', asyncHandler(adminAuditLogs));
router.get('/coupons', asyncHandler(listCoupons));
router.post('/coupons', asyncHandler(createCoupon));
router.put('/coupons/:id', asyncHandler(updateCoupon));

export default router;
