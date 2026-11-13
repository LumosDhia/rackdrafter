import type { Page } from '@playwright/test';

export async function newBlankProject(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByTestId('empty-canvas').waitFor();
}

export function nodeByLabel(page: Page, label: string) {
  return page.locator('.react-flow__node', { has: page.getByText(label, { exact: true }) });
}

export async function dropFromPalette(
  page: Page,
  slug: string,
  pos: { x: number; y: number },
): Promise<void> {
  const item = page.getByTestId(`palette-item-${slug}`);
  await item.waitFor();
  // Playwright's HTML5 DnD does not always populate dataTransfer mime types.
  // Click-to-place is the documented accessibility path and is reliable here.
  await item.click();
  await page.getByTestId('canvas').click({ position: pos });
}
