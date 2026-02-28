import dayjs from 'dayjs';
import User from '../models/User.js';

const GRACE_PERIOD_DAYS = 3;

export const subscriptionMaintenanceService = {
  async runExpiryDowngrades() {
    const users = await User.find({
      subscriptionStatus: 'active',
      subscriptionExpiry: { $exists: true, $ne: null },
    }).select('_id subscriptionExpiry subscriptionStatus');

    for (const user of users) {
      const expiry = dayjs(user.subscriptionExpiry);
      const graceEnd = expiry.add(GRACE_PERIOD_DAYS, 'day');
      if (dayjs().isAfter(graceEnd)) {
        await User.findByIdAndUpdate(user._id, { subscriptionStatus: 'expired' });
      }
    }
  },
};

