import { expect, test } from '@playwright/test';

import {
  cleanupE2EUsers,
  loginByForm,
  registerE2EUser,
} from '../fixtures/auth';

test.describe('newsletter subscription', () => {
  test.beforeEach(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test('subscribes and unsubscribes the signed-in user', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);

    await loginByForm(page, user);
    await page.goto('/settings/notifications');
    await page.waitForLoadState('networkidle');

    const toggle = page.getByTestId('newsletter-subscribe-switch');
    await expect(toggle).toBeVisible();
    // Signup auto-subscribe is skipped in E2E mode, so the journey starts off.
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const subscribed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/_serverFn/')
    );
    await toggle.click();
    await subscribed;
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const unsubscribed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/_serverFn/')
    );
    await toggle.click();
    await unsubscribed;
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // The state is persisted server-side, not only in local form state.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(
      page.getByTestId('newsletter-subscribe-switch')
    ).toHaveAttribute('aria-checked', 'true');
  });

  test('subscribes an address from the public waitlist form', async ({
    page,
  }) => {
    const email = `e2e-waitlist-${Date.now()}@example.test`;

    await page.goto('/waitlist');
    await page.waitForLoadState('networkidle');

    const form = page.locator('form').filter({
      has: page.locator('input[name="email"]'),
    });
    await form.locator('input[name="email"]').fill(email);

    const submission = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        response.url().includes('/_serverFn/')
    );
    await form.locator('button[type="submit"]').click();
    expect((await submission).ok()).toBeTruthy();

    // A successful submission resets the field and confirms success in place.
    await expect(form.locator('input[name="email"]')).toHaveValue('');
  });
});
