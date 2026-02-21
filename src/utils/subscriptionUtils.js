import dayjs from 'dayjs';

const TRIAL_MAX_DOCS = 5;
const TRIAL_MAX_DAYS = 7;
const GRACE_PERIOD_DAYS = 3;

/**
 * Checks if user can download full DOCX (not blocked by trial limits).
 * @param {Object} user - User document
 * @returns {{ allowed: boolean, reason?: string }}
 */
export function canDownloadFullDocx(user) {
  if (user.subscriptionStatus === 'active') {
    if (!user.subscriptionExpiry) return { allowed: true };
    const graceEnd = dayjs(user.subscriptionExpiry).add(GRACE_PERIOD_DAYS, 'day');
    if (dayjs().isBefore(graceEnd)) return { allowed: true };
  }

  if (user.subscriptionStatus === 'expired') {
    return { allowed: false, reason: 'Subscription expired' };
  }

  const docCount = user.trialDocCount ?? 0;
  if (docCount >= TRIAL_MAX_DOCS) {
    return { allowed: false, reason: 'Trial document limit reached (5 docs)' };
  }

  const trialStart = user.trialStartDate ?? user.createdAt;
  if (!trialStart) {
    return { allowed: true };
  }

  const daysSinceStart = dayjs().diff(dayjs(trialStart), 'day');
  if (daysSinceStart >= TRIAL_MAX_DAYS) {
    return { allowed: false, reason: 'Trial period expired (7 days)' };
  }

  return { allowed: true };
}
