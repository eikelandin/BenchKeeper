import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('every command in the table is a skill that exists in its plugin', async ({ page }) => {
  await page.goto('./');
  const names = await page.locator('#commands tbody th code').allTextContents();
  expect(names.length).toBeGreaterThan(10);
  for (const name of names) {
    const [, plugin, skill] = /^\/(cl-[a-z]+):([a-z-]+)$/.exec(name)!;
    expect(existsSync(`../plugins/${plugin}/skills/${skill}/SKILL.md`), name).toBe(true);
  }
});
