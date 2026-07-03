import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead
} from '../services/notificationCenterService.js';

export async function notifications(req, res) {
  const data = await listNotifications(req.user.id, { limit: req.query.limit });
  res.json(data);
}

export async function unreadCount(req, res) {
  const count = await getUnreadCount(req.user.id);
  res.json({ count });
}

export async function markRead(req, res) {
  const notification = await markNotificationRead(req.params.id, req.user.id);
  res.json(notification);
}

export async function readAll(req, res) {
  const result = await markAllNotificationsRead(req.user.id);
  res.json(result);
}
