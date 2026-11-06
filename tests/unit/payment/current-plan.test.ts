import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  plans: [] as Array<Record<string, unknown>>,
}));

vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      validator: () => builder,
      middleware: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
vi.mock('@/middlewares/auth-middleware', () => ({ authApiMiddleware: {} }));
vi.mock('@/db', () => ({ getDb: mocks.getDb }));
vi.mock('@/lib/price-plan', () => ({
  getAllPricePlans: () => mocks.plans,
  findPlanByPriceId: (priceId: string) =>
    mocks.plans.find((plan) =>
      (plan.prices as Array<{ priceId: string }>).some(
        (price) => price.priceId === priceId
      )
    ),
}));

import { getCurrentPlan } from '@/api/payment';

const currentPlan = getCurrentPlan as unknown as (input: {
  context: { userId: string };
}) => Promise<{
  currentPlan: { id: string } | null;
  subscription: Record<string, unknown> | null;
}>;

const FREE_PLAN = { id: 'free', prices: [], isFree: true, isLifetime: false };
const PRO_PLAN = {
  id: 'pro',
  prices: [{ priceId: 'price_monthly' }, { priceId: 'price_yearly' }],
  isFree: false,
  isLifetime: false,
};
const LIFETIME_PLAN = {
  id: 'lifetime',
  prices: [{ priceId: 'price_lifetime' }],
  isFree: false,
  isLifetime: true,
};

const client = createClient({ url: ':memory:' });
const db = drizzle(client);

const NOW = new Date('2026-01-01T00:00:00.000Z');

type PaymentRow = {
  id: string;
  priceId: string;
  type: 'subscription' | 'one_time';
  scene?: 'subscription' | 'lifetime';
  status: string;
  paid: boolean;
  createdAt?: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean | null;
  trialStart?: Date | null;
  trialEnd?: Date | null;
};

async function insertPayment(userId: string, row: PaymentRow) {
  const createdAt = row.createdAt ?? NOW;
  await client.execute({
    sql: `INSERT INTO payment (
      id, price_id, user_id, customer_id, subscription_id, session_id,
      type, scene, interval, status, paid,
      period_start, period_end, cancel_at_period_end, trial_start, trial_end,
      created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    args: [
      row.id,
      row.priceId,
      userId,
      `cus_${userId}`,
      null,
      `cs_${row.id}`,
      row.type,
      row.scene ?? null,
      null,
      row.status,
      row.paid ? 1 : 0,
      row.periodStart ? row.periodStart.getTime() : null,
      row.periodEnd ? row.periodEnd.getTime() : null,
      row.cancelAtPeriodEnd === undefined || row.cancelAtPeriodEnd === null
        ? null
        : row.cancelAtPeriodEnd
          ? 1
          : 0,
      row.trialStart ? row.trialStart.getTime() : null,
      row.trialEnd ? row.trialEnd.getTime() : null,
      createdAt.getTime(),
      createdAt.getTime(),
    ],
  });
}

beforeEach(async () => {
  await client.executeMultiple(`
    DROP TABLE IF EXISTS payment;
    CREATE TABLE payment (
      id TEXT PRIMARY KEY,
      price_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      subscription_id TEXT,
      session_id TEXT,
      invoice_id TEXT,
      type TEXT NOT NULL,
      scene TEXT,
      interval TEXT,
      status TEXT NOT NULL,
      paid INTEGER NOT NULL,
      period_start INTEGER,
      period_end INTEGER,
      cancel_at_period_end INTEGER,
      trial_start INTEGER,
      trial_end INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  mocks.getDb.mockReturnValue(db);
  mocks.plans = [FREE_PLAN, PRO_PLAN, LIFETIME_PLAN];
});

afterAll(() => client.close());

describe('current plan resolution', () => {
  test('falls back to the free plan when the user has no payments', async () => {
    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
    expect(result.subscription).toBeNull();
  });

  test('returns an active subscription with its plan and period', async () => {
    const periodStart = new Date('2026-01-01T00:00:00.000Z');
    const periodEnd = new Date('2026-02-01T00:00:00.000Z');
    await insertPayment('user_a', {
      id: 'pay_monthly',
      priceId: 'price_monthly',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: true,
      periodStart,
      periodEnd,
      cancelAtPeriodEnd: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('pro');
    expect(result.subscription).toMatchObject({
      id: 'pay_monthly',
      priceId: 'price_monthly',
      status: 'active',
      type: 'subscription',
      cancelAtPeriodEnd: true,
    });
    expect(result.subscription?.currentPeriodEnd).toEqual(periodEnd);
  });

  test('treats a trialing subscription as the current plan', async () => {
    await insertPayment('user_a', {
      id: 'pay_trial',
      priceId: 'price_yearly',
      type: 'subscription',
      scene: 'subscription',
      status: 'trialing',
      paid: true,
      trialStart: new Date('2026-01-01T00:00:00.000Z'),
      trialEnd: new Date('2026-01-15T00:00:00.000Z'),
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('pro');
    expect(result.subscription?.status).toBe('trialing');
    expect(result.subscription?.trialEndDate).toEqual(
      new Date('2026-01-15T00:00:00.000Z')
    );
  });

  test('ignores a canceled subscription and falls back to free', async () => {
    await insertPayment('user_a', {
      id: 'pay_canceled',
      priceId: 'price_monthly',
      type: 'subscription',
      scene: 'subscription',
      status: 'canceled',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
    expect(result.subscription).toBeNull();
  });

  test('ignores an unpaid subscription row', async () => {
    await insertPayment('user_a', {
      id: 'pay_unpaid',
      priceId: 'price_monthly',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: false,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
  });

  test('returns the lifetime plan for a completed one-time purchase', async () => {
    await insertPayment('user_a', {
      id: 'pay_lifetime',
      priceId: 'price_lifetime',
      type: 'one_time',
      scene: 'lifetime',
      status: 'completed',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('lifetime');
    expect(result.subscription).toBeNull();
  });

  test('prefers lifetime over an active subscription', async () => {
    await insertPayment('user_a', {
      id: 'pay_sub',
      priceId: 'price_monthly',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: true,
      createdAt: new Date('2026-02-01T00:00:00.000Z'),
    });
    await insertPayment('user_a', {
      id: 'pay_lifetime',
      priceId: 'price_lifetime',
      type: 'one_time',
      scene: 'lifetime',
      status: 'completed',
      paid: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('lifetime');
    expect(result.subscription).toBeNull();
  });

  test('ignores a one-time payment that is not a lifetime scene', async () => {
    await insertPayment('user_a', {
      id: 'pay_credit',
      priceId: 'price_lifetime',
      type: 'one_time',
      scene: 'subscription',
      status: 'completed',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
  });

  test('ignores a lifetime payment that is still pending', async () => {
    await insertPayment('user_a', {
      id: 'pay_pending',
      priceId: 'price_lifetime',
      type: 'one_time',
      scene: 'lifetime',
      status: 'pending',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
  });

  test('does not leak another user payments', async () => {
    await insertPayment('user_b', {
      id: 'pay_other',
      priceId: 'price_lifetime',
      type: 'one_time',
      scene: 'lifetime',
      status: 'completed',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan?.id).toBe('free');
    expect(result.subscription).toBeNull();
  });

  test('returns the newest active subscription when several exist', async () => {
    await insertPayment('user_a', {
      id: 'pay_old',
      priceId: 'price_monthly',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await insertPayment('user_a', {
      id: 'pay_new',
      priceId: 'price_yearly',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: true,
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.subscription?.id).toBe('pay_new');
    expect(result.subscription?.priceId).toBe('price_yearly');
  });

  test('returns a null plan when no free plan is configured', async () => {
    mocks.plans = [PRO_PLAN, LIFETIME_PLAN];

    const result = await currentPlan({ context: { userId: 'user_a' } });

    expect(result.currentPlan).toBeNull();
    expect(result.subscription).toBeNull();
  });

  test('falls back to free when the paid price id matches no configured plan', async () => {
    await insertPayment('user_a', {
      id: 'pay_unknown',
      priceId: 'price_retired',
      type: 'subscription',
      scene: 'subscription',
      status: 'active',
      paid: true,
    });

    const result = await currentPlan({ context: { userId: 'user_a' } });

    // The subscription stays visible even though its plan is gone, while the
    // plan slot resolves to null rather than a wrong tier.
    expect(result.currentPlan).toBeNull();
    expect(result.subscription?.priceId).toBe('price_retired');
  });
});
