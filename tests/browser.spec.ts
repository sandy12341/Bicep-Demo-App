import { test, expect } from '@playwright/test';

test('district reporting, filters, repair/loaner lifecycle and accessible responsive UI', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Classroom Ready', exact: true })).toBeVisible();
  await expect(page.locator('#local-banner')).toBeVisible();
  await expect(page.locator('#commit')).toHaveText('browser-test');
  await page.getByLabel('Filter by school', { exact: true }).selectOption('west');
  await expect(page.locator('#incidents > li')).toHaveCount(1);
  await page.getByLabel('Filter by status', { exact: true }).selectOption('resolved');
  await expect(page.locator('#empty')).toBeVisible();
  await page.getByLabel('Filter by school', { exact: true }).selectOption('all');
  await page.getByLabel('Filter by status', { exact: true }).selectOption('all');
  const asset = `DEMO-BROWSER-${test.info().project.name.toUpperCase()}`;
  await page.getByLabel('Synthetic device asset tag', { exact: true }).fill(asset);
  await page.getByLabel('School', { exact: true }).selectOption('north');
  await page.getByRole('button', { name: 'Report incident', exact: true }).click();
  const row = page.locator('#incidents > li').filter({ has: page.getByRole('heading', { name: asset, exact: true }) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: `Start repair ${asset}`, exact: true }).click();
  await row.getByLabel(`Available loaner for ${asset}`, { exact: true }).selectOption({ label: 'DEMO-LOAN-1' });
  await row.getByRole('button', { name: `Assign loaner ${asset}`, exact: true }).click();
  await expect(page.locator('#available-count')).toHaveText('5');
  await expect(row.getByRole('button', { name: `Resolve ${asset}`, exact: true })).toBeDisabled();
  await expect(row.getByRole('button', { name: `Delete ${asset}`, exact: true })).toBeDisabled();
  await page.reload();
  await expect(row.getByText('Loaner: DEMO-LOAN-1. Return it before resolution or deletion.', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: `Return loaner ${asset}`, exact: true }).click();
  await expect(page.locator('#available-count')).toHaveText('6');
  await row.getByRole('button', { name: `Resolve ${asset}`, exact: true }).click();
  await row.getByRole('button', { name: `Reopen ${asset}`, exact: true }).click();
  await row.getByRole('button', { name: `Delete ${asset}`, exact: true }).click();
  await expect(row).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('stale assignment displays a conflict and refreshes loaner availability', async ({ page, request }) => {
  await page.goto('/');
  const row = page.locator('[data-incident-id="10000000-0000-4000-8000-000000000001"]');
  await row.getByLabel('Available loaner for DEMO-CB-101', { exact: true }).selectOption({ label: 'DEMO-LOAN-1' });
  const response = await request.post('/api/incidents/10000000-0000-4000-8000-000000000002/loaner', {
    data: { loanerId: '20000000-0000-4000-8000-000000000001' },
  });
  expect(response.ok()).toBe(true);
  try {
    await row.getByRole('button', { name: 'Assign loaner DEMO-CB-101', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('already has an assignment');
    await expect(row.getByLabel('Available loaner for DEMO-CB-101', { exact: true }).getByRole('option', { name: 'DEMO-LOAN-1', exact: true })).toHaveCount(0);
  } finally {
    expect((await request.delete('/api/incidents/10000000-0000-4000-8000-000000000002/loaner')).ok()).toBe(true);
  }
});
