import SubscriptionPlan from '../models/SubscriptionPlan.js';
import { PLANS } from '../config/paymentPlans.js';

const PLAN_IDS = Object.keys(PLANS);

export async function ensureDefaultSubscriptionPlans() {
  await Promise.all(
    PLAN_IDS.map(async (planId) => {
      const base = PLANS[planId];
      if (!base) return;

      await SubscriptionPlan.updateOne(
        { planId },
        {
          $setOnInsert: {
            planId,
            displayName: base.name,
            amountRupees: base.amountRupees,
            months: base.months,
            currency: 'INR',
          },
        },
        { upsert: true }
      );
    })
  );
}

export async function getEffectivePlanConfig(planId) {
  const base = PLANS[planId];
  if (!base) {
    throw new Error('Invalid plan');
  }

  const override = await SubscriptionPlan.findOne({ planId }).lean();
  const amountRupees = override?.amountRupees ?? base.amountRupees;
  const months = override?.months ?? base.months;
  const currency = override?.currency || 'INR';

  return {
    id: planId,
    name: base.name,
    amountRupees,
    months,
    currency,
  };
}

export async function getAllPlansWithOverrides() {
  const overrides = await SubscriptionPlan.find({}).lean();
  const overrideById = new Map(overrides.map((p) => [p.planId, p]));

  return PLAN_IDS.map((planId) => {
    const base = PLANS[planId];
    if (!base) return null;
    const override = overrideById.get(planId);
    const amountRupees = override?.amountRupees ?? base.amountRupees;
    const months = override?.months ?? base.months;

    return {
      id: planId,
      name: base.name,
      amountRupees,
      months,
      currency: override?.currency || 'INR',
      defaultAmountRupees: base.amountRupees,
      updatedAt: override?.updatedAt ?? null,
    };
  }).filter(Boolean);
}

export async function updatePlanPrice(planId, amountRupees) {
  const base = PLANS[planId];
  if (!base) {
    throw new Error('Invalid plan');
  }

  if (typeof amountRupees !== 'number' || !Number.isFinite(amountRupees) || amountRupees <= 0) {
    throw new Error('amountRupees must be a positive number');
  }

  const doc = await SubscriptionPlan.findOneAndUpdate(
    { planId },
    {
      $set: {
        planId,
        displayName: base.name,
        amountRupees,
        months: base.months,
        currency: 'INR',
      },
    },
    { new: true, upsert: true }
  ).lean();

  return {
    id: doc.planId,
    name: doc.displayName,
    amountRupees: doc.amountRupees,
    months: doc.months,
    currency: doc.currency,
    updatedAt: doc.updatedAt,
  };
}

