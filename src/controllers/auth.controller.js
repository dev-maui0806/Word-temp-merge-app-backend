import { authService } from '../services/auth.service.js';
import { pinService } from '../services/index.js';
import User from '../models/User.js';

export async function sendEmailOtp(req, res) {
  try {
    const { email } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }
    console.log('email', email, deviceId, userAgent);
    await authService.sendEmailOtp(email, deviceId, userAgent);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function sendMobileOtp(req, res) {
  try {
    const { mobile } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!mobile) {
      return res.status(400).json({ error: 'Mobile is required' });
    }
    console.log('mobile', mobile, deviceId, userAgent);
    await authService.sendMobileOtp(mobile, deviceId, userAgent);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const session = await authService.verifyEmailOtp(
      email,
      otp,
      deviceId,
      userAgent
    );
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function verifyMobileOtp(req, res) {
  try {
    const { mobile, otp, email } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!mobile || !otp) {
      return res.status(400).json({ error: 'Mobile and OTP are required' });
    }

    const session = await authService.verifyMobileOtp(
      mobile,
      otp,
      deviceId,
      userAgent,
      email
    );
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function register(req, res) {
  try {
    const { email, password } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const session = await authService.registerWithPassword(email, password, deviceId, userAgent);
    res.status(201).json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function loginWithPassword(req, res) {
  try {
    const { email, password } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const session = await authService.loginWithPassword(email, password, deviceId, userAgent);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;
    const deviceId = req.body.deviceId || req.headers['x-device-id'] || '';
    const userAgent = req.body.userAgent || req.headers['user-agent'] || '';

    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required' });
    }

    const session = await authService.googleAuth(idToken, deviceId, userAgent);
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function me(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  
  // Check if PIN is set (pinHash was excluded from req.user for security)
  // Use exists() for efficient check without fetching the actual hash value
  const hasPin = await User.exists({ _id: user._id, pinHash: { $exists: true, $ne: null } });
  
  res.json({
    id: user._id,
    email: user.email,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionExpiry: user.subscriptionExpiry,
    subscriptionPlan: user.subscriptionPlan,
    trialDocCount: user.trialDocCount,
    trialStartDate: user.trialStartDate,
    hasPin: !!hasPin, // PIN status indicator (exists() returns _id or null)
  });
}

export async function updateProfile(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { name, mobile } = req.body || {};

    if (typeof name === 'string' && name.trim()) {
      user.name = name.trim();
    }

    if (typeof mobile === 'string' && mobile.trim()) {
      user.mobile = mobile.trim();
    }

    await user.save();

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      mobile: user.mobile,
      role: user.role,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionExpiry: user.subscriptionExpiry,
      subscriptionPlan: user.subscriptionPlan,
      trialDocCount: user.trialDocCount,
      trialStartDate: user.trialStartDate,
    });
  } catch (err) {
    // Handle duplicate mobile errors gracefully
    if (err.code === 11000 && err.keyPattern?.mobile) {
      return res.status(400).json({ error: 'This mobile number is already in use.' });
    }
    res.status(400).json({ error: err.message });
  }
}

export async function setupPin(req, res) {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { pin } = req.body || {};
    if (!pin) return res.status(400).json({ error: 'PIN is required.' });

    const pinHash = await pinService.hashPin(pin);

    user.pinHash = pinHash;
    user.pinFailedAttempts = 0;
    user.pinLockedUntil = null;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function loginWithPin(req, res) {
  try {
    const { email, pin, deviceId, userAgent } = req.body || {};

    if (!email || !pin || !deviceId) {
      return res.status(400).json({ error: 'Email, PIN, and deviceId are required.' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.pinHash) {
      return res.status(400).json({ error: 'PIN is not set for this account.' });
    }

    const hasDevice =
      Array.isArray(user.devices) && user.devices.some((d) => d.deviceId === deviceId);
    if (!hasDevice) {
      return res.status(403).json({
        error: 'PIN cannot be used on a new device. Please log in with OTP / Google once first.',
        code: 'PIN_NEW_DEVICE',
      });
    }

    const result = await pinService.verifyPin(user, pin);
    if (!result.valid) {
      if (result.locked) {
        const updatedUser = await User.findById(user._id);
        const lockedUntil =
          updatedUser && updatedUser.pinLockedUntil ? updatedUser.pinLockedUntil : null;
        return res.status(403).json({
          error: 'PIN locked due to too many failed attempts. Please use OTP / Google login.',
          code: 'PIN_LOCKED',
          lockedUntil,
        });
      }
      return res.status(400).json({
        error: 'Invalid PIN.',
        code: 'PIN_INVALID',
        attemptsLeft: result.attemptsLeft,
      });
    }

    const agent = userAgent || req.body.userAgent || req.headers['user-agent'] || '';
    await authService.upsertDevice(user, deviceId, agent);
    const session = await authService.createSession(user, deviceId, agent, 'pin');
    res.json(session);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}

export async function refreshToken(req, res) {
  try {
    const refreshToken =
      req.body.refreshToken ||
      req.headers['x-refresh-token'] ||
      req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'Refresh token required' });
    }

    const session = await authService.refreshTokens(refreshToken);
    res.json(session);
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
}
