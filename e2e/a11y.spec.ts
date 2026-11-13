import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { newBlankProject } from './helpers.ts';

async function serious(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.describe('accessibility', () => {
  test('project list has no serious violations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New project' }).waitFor();
    expect(await serious(page)).toEqual([]);
  });

  test('editor empty state has no serious violations', async ({ page }) => {
    await newBlankProject(page);
    expect(await serious(page)).toEqual([]);
  });

  test('palette rows are keyboard reachable and labelled', async ({ page }) => {
    await newBlankProject(page);
    await page.getByRole('tab', { name: /Services/ }).click();
    const search = page.getByLabel('Search catalog');
    await search.focus();
    await search.fill('jellyfin');
    await search.press('Enter');
    await expect(page.locator('.react-flow__node')).toHaveCount(1);
    const tabs = page.getByRole('complementary', { name: 'Catalog' }).getByRole('tab');
    await expect(tabs).toHaveCount(2);
    for (const tab of await tabs.all()) await expect(tab).toHaveAttribute('aria-selected', /true|false/);
    expect(await serious(page)).toEqual([]);
  });
});
