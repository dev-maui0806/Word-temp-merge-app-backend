import bcrypt from 'bcrypt';
import dayjs from 'dayjs';
import { validatePinFormat } from '../utils/pinUtils.js';
import User from '../models/User.js';

const SALT_ROUNDS = parseInt(process.env.PIN_SALT_ROUNDS || '10', 10);
const MAX_FAILED_ATTEMPTS = parseInt(process.env.PIN_MAX_FAILED_ATTEMPTS || '5', 10);
const LOCK_DURATION_MINUTES = parseInt(process.env.PIN_LOCK_DURATION_MINUTES || '15', 10);

export const pinService = {
  /**
   * Hash a PIN for storage.
   * @param {string} pin - 4 digit numeric
   * @returns {Promise<string>}
   */
  async hashPin(pin) {
    validatePinFormat(pin);
    return bcrypt.hash(pin, SALT_ROUNDS);
  },

  /**
   * Verify PIN and update failed attempts / lock.
   * @param {Object} user - User document
   * @param {string} pin - Plain PIN
   * @returns {Promise<{ valid: boolean, locked?: boolean }>}
   */
  async verifyPin(user, pin) {
    if (!user.pinHash) {
      return { valid: false };
    }

    if (user.pinLockedUntil && dayjs().isBefore(user.pinLockedUntil)) {
      return { valid: false, locked: true };
    }

    validatePinFormat(pin);

    const match = await bcrypt.compare(pin, user.pinHash);

    if (match) {
      await User.findByIdAndUpdate(user._id, {
        pinFailedAttempts: 0,
        pinLockedUntil: null,
      });
      return { valid: true };
    }

    const attempts = (user.pinFailedAttempts || 0) + 1;
    const updates = { pinFailedAttempts: attempts };

    if (attempts >= MAX_FAILED_ATTEMPTS) {
      updates.pinLockedUntil = dayjs().add(LOCK_DURATION_MINUTES, 'minute').toDate();
    }

    await User.findByIdAndUpdate(user._id, updates);

    return {
      valid: false,
      locked: attempts >= MAX_FAILED_ATTEMPTS,
      attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - attempts),
    };
  },

  /**
   * Check if user PIN is currently locked.
   */
  isLocked(user) {
    return (
      user.pinLockedUntil &&
      dayjs().isBefore(user.pinLockedUntil)
    );
  },

  /**
   * Get lock expiry if locked.
   */
  getLockedUntil(user) {
    return user.pinLockedUntil && dayjs().isBefore(user.pinLockedUntil)
      ? user.pinLockedUntil
      : null;
  },
};
