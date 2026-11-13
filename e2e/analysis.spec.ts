import { expect, test } from '@playwright/test';
import { newBlankProject } from './helpers.ts';

test.describe('analysis', () => {
  test('a stateful service with no backup is reported', async ({ page }) => {
    await newBlankProject(page);
    await page.getByLabel('Search catalog').fill('proxmox node');
    await page.getByTestId('palette-item-proxmox-node').click();
    await page.getByTestId('canvas').click({ position: { x: 40, y: 40 } });

    await page.getByRole('tab', { name: /Services/ }).click();
    await page.getByLabel('Search catalog').fill('postgres');
    await page.getByTestId('palette-item-postgres').click();
    await page.locator('.react-flow__node', { hasText: 'Proxmox node' }).first().click();

    const panel = page.getByRole('region', { name: 'Findings' });
    await expect(panel.getByText(/stores data but nothing backs it up/)).toBeVisible();
    await expect(panel.getByText('BAK001').first()).toBeVisible();
  });

  test('a host port conflict is reported as an error', async ({ page }) => {
    await newBlankProject(page);

    // One host, two services placed on it.
    await page.getByLabel('Search catalog').fill('proxmox node');
    await page.getByTestId('palette-item-proxmox-node').click();
    await page.getByTestId('canvas').click({ position: { x: 40, y: 40 } });

    await page.getByRole('tab', { name: /Services/ }).click();
    for (const slug of ['jellyfin', 'kavita']) {
      await page.getByLabel('Search catalog').fill(slug);
      await page.getByTestId(`palette-item-${slug}`).click();
      await page.locator('.react-flow__node', { hasText: 'Proxmox node' }).first().click();
    }

    await page.locator('.react-flow__node', { hasText: 'Kavita' }).first().click();
    // Jellyfin already claims 8096 on this host; make Kavita claim it too.
    await page.getByLabel('http host port').fill('8096');

    const panel = page.getByRole('region', { name: 'Findings' });
    await expect(panel.getByText(/both publish port 8096/)).toBeVisible();
  });

  test('the homelab template has no errors and lists its exposure and cost', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Homelab \(real\)/ }).click();
    await expect(page.getByTestId('canvas')).toBeVisible();

    const badge = page.getByTestId('findings-toggle');
    await expect(badge).toContainText('0');

    const panel = page.getByRole('region', { name: 'Findings' });
    await panel.getByRole('tab', { name: /Exposure/ }).click();
    await expect(panel.getByRole('cell', { name: 'pve.lumosdhia.com' })).toBeVisible();
    await expect(panel.getByRole('cell', { name: 'docker.lumosdhia.com' })).toBeVisible();

    await panel.getByRole('tab', { name: 'Cost' }).click();
    await expect(panel.getByText('All-in / month')).toBeVisible();
    await expect(panel.getByText('Energy / month')).toBeVisible();
  });

  test('the k3s template has no errors and reports its single-cable notes', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /k3s cluster \+ CI\/CD/ }).click();
    await expect(page.getByTestId('canvas')).toBeVisible();
    const panel = page.getByRole('region', { name: 'Findings' });
    await expect(panel.getByText(/has one cable or radio link/).first()).toBeVisible();
    const badge = page.getByTestId('findings-toggle');
    await expect(badge).toContainText('0');
  });
});
