import { expect, test } from '@playwright/test';

import {
  cleanupE2EUsers,
  loginByForm,
  registerE2EUser,
} from '../fixtures/auth';
import { E2E_TEST_SECRET } from '../fixtures/test-data';

test.describe('account deletion', () => {
  test.beforeEach(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test.afterEach(async ({ request }) => {
    await cleanupE2EUsers(request);
  });

  test('deletes the signed-in account and ends the session', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);

    await loginByForm(page, user);
    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('delete-account-trigger').click();
    await expect(page.getByTestId('delete-account-dialog')).toBeVisible();

    const deletion = page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth/delete-user') &&
        response.request().method() === 'POST'
    );
    await page.getByTestId('delete-account-confirm').click();
    expect((await deletion).ok()).toBeTruthy();

    // The card navigates to the landing page after a successful deletion.
    await expect(page).toHaveURL(/\/$/);

    // The session must be gone: the protected area now redirects to login.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/);

    // The account row is removed from D1, not just signed out.
    const lookup = await request.get(
      `/api/e2e/users?email=${encodeURIComponent(user.email)}`,
      { headers: { 'x-e2e-secret': E2E_TEST_SECRET } }
    );
    expect(lookup.ok(), await lookup.text()).toBeTruthy();
    expect((await lookup.json()).user).toBeNull();
  });

  test('keeps the account when deletion is cancelled', async ({
    page,
    request,
  }) => {
    const user = await registerE2EUser(request);

    await loginByForm(page, user);
    await page.goto('/settings/security');
    await page.waitForLoadState('networkidle');

    await page.getByTestId('delete-account-trigger').click();
    await expect(page.getByTestId('delete-account-dialog')).toBeVisible();
    await page.getByTestId('delete-account-cancel').click();
    await expect(page.getByTestId('delete-account-dialog')).toBeHidden();

    // The session survives a cancelled deletion.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard\/?$/);

    const lookup = await request.get(
      `/api/e2e/users?email=${encodeURIComponent(user.email)}`,
      { headers: { 'x-e2e-secret': E2E_TEST_SECRET } }
    );
    expect(lookup.ok(), await lookup.text()).toBeTruthy();
    expect((await lookup.json()).user).not.toBeNull();
  });
});
