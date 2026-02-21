import jwt from 'jsonwebtoken';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import User from '../models/User.js';
import Otp from '../models/Otp.js';
import RefreshToken from '../models/RefreshToken.js';
import { otpDeliveryService } from './otpDelivery.service.js';
import {
  JWT_ACCESS_EXPIRY,
  JWT_REFRESH_EXPIRY_DAYS,
  OTP_EXPIRY_MINUTES,
  OTP_LENGTH,
} from '../config/auth.js';

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateRefreshToken() {
  return uuidv4();
}

export const authService = {
  async sendEmailOtp(email, deviceId = '', userAgent = '') {
    console.log('sendEmailOtp', email, deviceId, userAgent);
    const normalized = String(email).toLowerCase().trim();
    const otp = generateOtp();
    const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toDate();

    await Otp.deleteMany({ email: normalized });
    await Otp.create({ email: normalized, otp, expiresAt });

    await otpDeliveryService.sendEmailOtp(normalized, otp);
    return { sent: true };
  },

  async sendMobileOtp(mobile, deviceId = '', userAgent = '') {
    const normalized = String(mobile).trim();
    const otp = generateOtp();
    const expiresAt = dayjs().add(OTP_EXPIRY_MINUTES, 'minute').toDate();

    await Otp.deleteMany({ mobile: normalized });
    await Otp.create({ mobile: normalized, otp, expiresAt });

    await otpDeliveryService.sendSmsOtp(normalized, otp);
    return { sent: true };
  },

  async verifyEmailOtp(email, otp, deviceId = '', userAgent = '') {
    const normalized = String(email).toLowerCase().trim();
    const record = await Otp.findOne({
      email: normalized,
      otp: String(otp).trim(),
      expiresAt: { $gt: new Date() },
    });

    if (!record) throw new Error('Invalid or expired OTP');

    await Otp.deleteOne({ _id: record._id });

    let user = await User.findOne({ email: normalized });
    if (!user) {
      const initialName = normalized.split('@')[0] || '';
      user = await User.create({
        email: normalized,
        name: initialName,
        trialStartDate: new Date(),
      });
    }

    await this.upsertDevice(user, deviceId, userAgent);
    return this.createSession(user, deviceId, userAgent);
  },

  async verifyMobileOtp(mobile, otp, deviceId = '', userAgent = '', email = '') {
    const normalized = String(mobile).trim();
    const record = await Otp.findOne({
      mobile: normalized,
      otp: String(otp).trim(),
      expiresAt: { $gt: new Date() },
    });

    if (!record) throw new Error('Invalid or expired OTP');

    await Otp.deleteOne({ _id: record._id });

    let user = await User.findOne({ mobile: normalized });
    if (!user) {
      const userEmail =
        email?.trim() ||
        `user_${uuidv4().slice(0, 8)}@otp.local`;
      const initialName = userEmail.split('@')[0] || '';
      user = await User.create({
        email: userEmail,
        mobile: normalized,
        name: initialName,
        trialStartDate: new Date(),
      });
    }

    await this.upsertDevice(user, deviceId, userAgent);
    return this.createSession(user, deviceId, userAgent);
  },

  async googleAuth(idToken, deviceId = '', userAgent = '') {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email?.toLowerCase().trim();
    if (!email) throw new Error('Google profile missing email');

    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        await user.save();
      } else {
        const initialName = payload.name?.trim() || email.split('@')[0] || '';
        user = await User.create({
          email,
          googleId,
          name: initialName,
          trialStartDate: new Date(),
        });
      }
    }

    await this.upsertDevice(user, deviceId, userAgent);
    return this.createSession(user, deviceId, userAgent);
  },

  async upsertDevice(user, deviceId, userAgent) {
    if (!deviceId) return;

    const devices = user.devices || [];
    const idx = devices.findIndex((d) => d.deviceId === deviceId);
    const entry = {
      deviceId,
      lastLogin: new Date(),
      userAgent: userAgent || '',
    };
    if (idx >= 0) {
      devices[idx] = entry;
    } else {
      devices.push(entry);
    }
    await User.findByIdAndUpdate(user._id, { devices });
  },

  async createSession(user, deviceId, userAgent, authMethod = 'otp') {
    const accessToken = jwt.sign(
      { userId: user._id.toString(), type: 'access', authMethod },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const refreshToken = generateRefreshToken();
    const expiresAt = dayjs().add(JWT_REFRESH_EXPIRY_DAYS, 'day').toDate();

    await RefreshToken.create({
      userId: user._id,
      token: refreshToken,
      deviceId,
      userAgent,
      expiresAt,
      authMethod,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
      },
    };
  },

  async refreshTokens(refreshToken) {
    const record = await RefreshToken.findOne({
      token: refreshToken,
      expiresAt: { $gt: new Date() },
    });
    if (!record) throw new Error('Invalid or expired refresh token');

    await RefreshToken.deleteOne({ _id: record._id });

    const user = await User.findById(record.userId);
    if (!user) throw new Error('User not found');

    const accessToken = jwt.sign(
      { userId: user._id.toString(), type: 'access', authMethod: record.authMethod || 'otp' },
      process.env.JWT_SECRET,
      { expiresIn: JWT_ACCESS_EXPIRY }
    );

    const newRefreshToken = generateRefreshToken();
    const expiresAt = dayjs().add(JWT_REFRESH_EXPIRY_DAYS, 'day').toDate();

    await RefreshToken.create({
      userId: user._id,
      token: newRefreshToken,
      deviceId: record.deviceId,
      userAgent: record.userAgent,
      expiresAt,
      authMethod: record.authMethod || 'otp',
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: JWT_REFRESH_EXPIRY_DAYS * 24 * 60 * 60,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        subscriptionStatus: user.subscriptionStatus,
      },
    };
  },

  verifyAccessToken(token) {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    return decoded;
  },
};
