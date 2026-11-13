import { expect, test } from '@playwright/test';
import { newBlankProject } from './helpers.ts';

test.describe('catalog palette', () => {
  test('shows both tabs with the full catalog counts', async ({ page }) => {
    await newBlankProject(page);
    await expect(page.getByRole('tab', { name: 'Devices 47' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Services 98' })).toBeVisible();
  });

  test('search narrows to a single service and Enter inserts it', async ({ page }) => {
    await newBlankProject(page);
    await page.getByRole('tab', { name: /Services/ }).click();
    const search = page.getByLabel('Search catalog');
    await search.fill('jelly');
    await expect(page.getByTestId('palette-item-jellyfin')).toBeVisible();
    await expect(page.getByTestId('palette-item-jellyseerr')).toBeVisible();
    await expect(page.getByTestId('palette-item-postgres')).toHaveCount(0);

    await search.press('Enter');
    await expect(page.locator('.react-flow__node').first()).toBeVisible();
    await expect(page.getByText('Jellyfin', { exact: true }).first()).toBeVisible();
  });

  test('search is case-insensitive and reports no matches honestly', async ({ page }) => {
    await newBlankProject(page);
    const search = page.getByLabel('Search catalog');
    await search.fill('RASPBERRY');
    await expect(page.getByTestId('palette-item-raspberry-pi-5')).toBeVisible();
    await search.fill('zzzzz');
    await expect(page.getByText('0 matches')).toBeVisible();
    await expect(page.locator('[data-testid^="palette-item-"]')).toHaveCount(0);
  });

  test('click places a node on the canvas and Escape clears the search', async ({ page }) => {
    await newBlankProject(page);
    const search = page.getByLabel('Search catalog');
    await search.fill('proxmox node');
    await page.getByTestId('palette-item-proxmox-node').click();
    await page.getByTestId('canvas').click({ position: { x: 420, y: 260 } });
    const node = page.locator('.react-flow__node');
    await expect(node).toHaveCount(1);
    await expect(node.getByText('Proxmox node', { exact: true })).toBeVisible();
    await expect(node.getByText('hypervisor', { exact: true })).toBeVisible();

    await search.fill('immich');
    await search.press('Escape');
    await expect(search).toHaveValue('');
  });

  test('renders locally bundled brand artwork, never a remote URL', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (/\.(svg|png|woff2?)(\?|$)/.test(url)) requests.push(url);
    });
    await newBlankProject(page);
    await page.getByRole('tab', { name: /Services/ }).click();
    await expect(page.getByTestId('palette-item-jellyfin')).toBeAttached();
    await page.waitForTimeout(400);
    expect(requests.length).toBeGreaterThan(0);
    for (const url of requests) {
      expect(url.startsWith('http://127.0.0.1') || url.startsWith('/')).toBe(true);
    }
  });
});
