const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const deliverOtp = async (email, subject, otp) => {
  if (process.env.EMAIL_ENABLED === 'false') {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Email verification is unavailable');
      error.statusCode = 503;
      throw error;
    }
    return otp;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      text: `Your verification code is: ${otp}`
    });
    return null;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      error.statusCode = 503;
      throw error;
    }
    console.warn('Email delivery failed in development; returning a verification code');
    return otp;
  }
};

const deliverPasswordReset = async (email, resetLink) => {
  if (process.env.EMAIL_ENABLED === 'false') {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error('Password reset email is unavailable');
      error.statusCode = 503;
      throw error;
    }
    return false;
  }

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset your password',
      text: `Use this link to reset your password. It expires in 15 minutes: ${resetLink}`
    });
    return true;
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      error.statusCode = 503;
      throw error;
    }
    console.warn('Password reset email delivery failed in development');
    return false;
  }
};

exports.register = async (req, res) => {
  try {
    const { name, password, phone } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!name?.trim() || !email || !password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'Name, email, and a password of at least 6 characters are required' });
    }
    if (req.body.confirmPassword && req.body.confirmPassword !== password) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'User already exists' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = crypto.randomInt(100000, 999999).toString();
    const user = new User({
      name: name.trim(),
      email,
      password: hashedPassword,
      phone,
      otp,
      otpExpires: Date.now() + 10 * 60 * 1000
    });
    await user.save();

    const verificationCode = await deliverOtp(email, 'Verify your account', otp);

    res.status(201).json({
      success: true,
      requiresVerification: true,
      message: 'User registered successfully. Please verify your email.',
      ...(verificationCode && process.env.NODE_ENV !== 'production' ? { verificationCode } : {})
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Invalid credentials' });

    if (!user.isVerified) return res.status(400).json({ success: false, message: 'Please verify your email first' });

    const token = jwt.sign(
      { userId: user._id, isAdmin: user.isAdmin, isDeliveryPartner: user.isDeliveryPartner },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.REFRESH_SECRET || 'refresh_secret',
      { expiresIn: '30d' }
    );

    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    res.json({
      success: true,
      token,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isAdmin: user.isAdmin,
        isDeliveryPartner: user.isDeliveryPartner
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET || 'refresh_secret');
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }

    const newToken = jwt.sign(
      { userId: user._id, isAdmin: user.isAdmin, isDeliveryPartner: user.isDeliveryPartner },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );

    res.json({ success: true, token: newToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
};

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.isVerified) return res.status(400).json({ success: false, message: 'Email is already verified' });

    const otp = crypto.randomInt(100000, 999999).toString();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const verificationCode = await deliverOtp(email, 'Your verification code', otp);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      ...(verificationCode && process.env.NODE_ENV !== 'production' ? { verificationCode } : {})
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const user = await User.findOne({ email, otp, otpExpires: { $gt: Date.now() } });

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = await User.findOne({ email });
    const genericMessage = 'If an account exists for that email, a password reset link has been sent.';
    if (!user) return res.json({ success: true, message: genericMessage });

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.resetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetTokenExpires = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    const origin = user.isAdmin
      ? (process.env.ADMIN_FRONTEND_URL || 'http://localhost:4300')
      : (process.env.FRONTEND_URL || 'http://localhost:4200');
    const resetUrl = new URL(user.isAdmin ? '/' : '/reset-password', origin);
    resetUrl.searchParams.set('token', resetToken);
    const emailSent = await deliverPasswordReset(email, resetUrl.toString());

    res.json({
      success: true,
      message: genericMessage,
      ...(process.env.NODE_ENV !== 'production' && !emailSent ? { resetLink: resetUrl.toString() } : {})
    });
  } catch (err) {
    res.status(err.statusCode || 500).json({ success: false, message: err.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (typeof token !== 'string' || !token || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ success: false, message: 'A reset token and password of at least 8 characters are required' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetToken: tokenHash,
      resetTokenExpires: { $gt: Date.now() }
    });

    if (!user) return res.status(400).json({ success: false, message: 'Invalid or expired token' });

    user.password = await bcrypt.hash(password, 12);
    user.resetToken = null;
    user.resetTokenExpires = null;
    user.refreshToken = null;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password -otp -resetToken');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, profileImage } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name, phone, profileImage },
      { new: true }
    ).select('-password -otp -resetToken');

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}; 