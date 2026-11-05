import { test, expect } from '@playwright/test';

test('usable browser UI with CRUD and local-mode warning', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bicep Task Board', exact: true })).toBeVisible();
  await expect(page.locator('#local-banner')).toBeVisible();
  await expect(page.locator('#commit')).toHaveText('browser-test');
  const title = `Browser task ${test.info().project.name}`;
  await page.getByLabel('Task title', { exact: true }).fill(title);
  await page.getByRole('button', { name: '+ Add task', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Complete ${title}`, exact: true }).click();
  await expect(page.getByRole('button', { name: `Reopen ${title}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `Delete ${title}`, exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  const errors = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(errors).toBe(false);
});
