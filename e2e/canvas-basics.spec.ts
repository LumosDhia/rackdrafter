import { expect, test } from '@playwright/test';
import { dropFromPalette, newBlankProject, nodeByLabel } from './helpers.ts';

test('canvas basics', async ({ page }) => {
  await newBlankProject(page);
  await expect(page.getByTestId('empty-canvas')).toBeVisible();
  await dropFromPalette(page, 'mini-pc', { x: 220, y: 220 });
  await expect(nodeByLabel(page, 'Mini PC')).toBeVisible();
  await page.keyboard.press('F2');
  await page.waitForTimeout(300);
  await page.getByLabel('Node label').fill('nuc-1');
  await page.mouse.click(20, 20);
  await page.waitForTimeout(300);
  await expect(nodeByLabel(page, 'nuc-1')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(nodeByLabel(page, 'Mini PC')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('empty-canvas')).toBeVisible();
  await page.keyboard.press('Control+Shift+z');
  await expect(nodeByLabel(page, 'Mini PC')).toBeVisible();
});
