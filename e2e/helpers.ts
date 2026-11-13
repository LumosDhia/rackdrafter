import type { Page } from '@playwright/test';

export async function newBlankProject(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New project' }).click();
  await page.getByTestId('empty-canvas').waitFor();
}

export function nodeByLabel(page: Page, label: string) {
  return page.locator('.react-flow__node', { hasText: label });
}

export async function dropFromPalette(
  page: Page,
  slug: string,
  pos: { x: number; y: number },
): Promise<void> {
  const item = page.locator(`[data-slug="${slug}"]`);
  const canvas = page.locator('.react-flow');
  await item.dragTo(canvas, { targetPosition: pos });
  await page.waitForTimeout(500);
}
