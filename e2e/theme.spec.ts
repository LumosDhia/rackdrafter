import { expect, test } from '@playwright/test';

test('theme toggle persists', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).waitFor();
  await page.keyboard.press('Shift+D');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
});
