import { expect, test } from '@playwright/test';

// 0.1 ships the plugins only: no page offers the command line or the browser app yet.
for (const path of ['./', './overview/', './app/', './writes/']) {
  test(`${path} offers no npx, app or benchkeeper command`, async ({ page }) => {
    await page.goto(path);
    expect(await page.locator('main').innerText()).not.toMatch(/npx |@cedarloom\/app|cedarloom-app|\bbenchkeeper (plan|apply|doctor|verify|setup)/i);
  });
}
