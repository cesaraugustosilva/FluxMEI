import { createReferralFromCode, getReferralSummary, normalizeReferralCode } from '../services/referralService.js';
import { rejectUnexpectedFields } from '../utils/validation.js';

export async function myReferral(req, res) {
  const summary = await getReferralSummary(req.user.id);
  res.json({ success: true, referral: summary });
}

export async function applyReferral(req, res) {
  rejectUnexpectedFields(req.body, ['referral_code', 'referralCode', 'code']);
  const code = normalizeReferralCode(req.body.referral_code || req.body.referralCode || req.body.code);
  const referral = await createReferralFromCode({
    referralCode: code,
    referredUserId: req.user.id,
    req
  });

  res.json({
    success: true,
    applied: Boolean(referral),
    referral: referral ? {
      id: referral.id,
      status: referral.status,
      reward_days: referral.reward_days
    } : null
  });
}
