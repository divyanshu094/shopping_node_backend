const Notification = require('../models/Notification');
const { publishEvent, TOPICS } = require('../config/kafka');

exports.getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const query = { user: req.user.userId };

    if (isRead !== undefined) query.isRead = isRead === 'true';

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      notifications,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.notificationId, user: req.user.userId },
      { isRead: true },
      { new: true }
    );

    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });

    res.json({ success: true, notification });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.sendPushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;

    const user = await require('../models/User').findByIdAndUpdate(
      req.user.userId,
      { pushToken },
      { new: true }
    );

    res.json({ success: true, message: 'Push token updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Helper function to create notification
exports.createNotification = async (userId, title, message, type = 'system', data = {}) => {
  try {
    const notification = new Notification({
      user: userId,
      title,
      message,
      type,
      data
    });

    await notification.save();

    // Publish notification event
    await publishEvent(TOPICS.NOTIFICATIONS, {
      eventType: 'NOTIFICATION_CREATED',
      notificationId: notification._id,
      userId,
      title,
      message,
      type,
      data
    });

    return notification;
  } catch (err) {
    console.error('Error creating notification:', err);
  }
};