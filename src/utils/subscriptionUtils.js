import dayjs from 'dayjs';

const TRIAL_MAX_DOCS = 5;
const TRIAL_MAX_DAYS = 7;
const GRACE_PERIOD_DAYS = 3;

/**
 * Returns true if the user is an administrator (unlimited documents, no subscription required).
 * @param {Object} user - User document with role
 */
export function isAdmin(user) {
  return user && user.role === 'admin';
}

/**
 * Checks if user can download full DOCX (not blocked by trial limits).
 * Administrators always have full access regardless of subscription/trial state.
 * @param {Object} user - User document
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canDownloadFullDocx(user) {
  if (isAdmin(user)) {
    return { allowed: true };
  }

  if (user.subscriptionStatus === 'active') {
    if (!user.subscriptionExpiry) return { allowed: true };
    const graceEnd = dayjs(user.subscriptionExpiry).add(GRACE_PERIOD_DAYS, 'day');
    if (dayjs().isBefore(graceEnd)) return { allowed: true };
    return { allowed: false, reason: 'Subscription expired' };
  }

  if (user.subscriptionStatus === 'expired') {
    return { allowed: false, reason: 'Subscription expired' };
  }

  const docCount = user.trialDocCount ?? 0;
  if (docCount >= TRIAL_MAX_DOCS) {
    return { allowed: false, reason: 'Trial document limit reached (5 docs)' };
  }

  // Only enforce 7-day trial limit when trialStartDate is explicitly set.
  // When it's missing (e.g. legacy accounts), we use only the 5-doc limit so we don't
  // block users whose account age is old but who haven't used 5 downloads.
  if (user.trialStartDate) {
    const now = dayjs().startOf('day');
    const trialStart = dayjs(user.trialStartDate).startOf('day');
    const daysSinceStart = now.diff(trialStart, 'day');
    if (daysSinceStart >= TRIAL_MAX_DAYS) {
      return { allowed: false, reason: 'Trial period expired (7 days)' };
    }
  }

  return { allowed: true };
}
