import { expect, test, type Page } from '@playwright/test';
import { newBlankProject } from './helpers.ts';

async function place(page: Page, slug: string, x: number, y: number) {
  const tab = ['jellyfin', 'postgres', 'immich'].includes(slug) ? /Services/ : /Devices/;
  await page.getByRole('tab', { name: tab }).click();
  const search = page.getByLabel('Search catalog');
  await search.fill(slug.replace(/-/g, ' '));
  await page.getByTestId(`palette-item-${slug}`).click();
  await search.fill('');
  await page.getByTestId('canvas').click({ position: { x, y } });
}

async function selectNode(page: Page, label: string) {
  await page.locator('.react-flow__node', { hasText: label }).first().click();
}

async function addSubnet(page: Page, name: string, cidr: string) {
  await page.getByLabel('New subnet name').fill(name);
  await page.getByLabel('New subnet CIDR').fill(cidr);
  await page.getByRole('button', { name: 'Add' }).click();
}

test.describe('editing', () => {
  test('dropping a service on a device places it on that host', async ({ page }) => {
    await newBlankProject(page);
    await place(page, 'proxmox-node', 260, 200);
    await expect(page.locator('.react-flow__node')).toHaveCount(1);

    // Drop the service directly onto the device card.
    await page.getByRole('tab', { name: /Services/ }).click();
    const search = page.getByLabel('Search catalog');
    await search.fill('jellyfin');
    await page.getByTestId('palette-item-jellyfin').click();
    await page.locator('.react-flow__node', { hasText: 'Proxmox node' }).first().click();

    await expect(page.locator('.react-flow__node')).toHaveCount(2);
    await expect(page.getByText('1 svc', { exact: true })).toBeVisible();
    // Derived tether edge between host and service.
    await expect(page.locator('.react-flow__edge')).toHaveCount(1);

    await selectNode(page, 'Jellyfin');
    await expect(page.getByLabel('Host', { exact: true })).toHaveValue(/n_/);
  });

  test('a subnet can be created and an address allocated from it', async ({ page }) => {
    await newBlankProject(page);
    await place(page, 'dell-optiplex-micro', 320, 240);

    await page.getByTestId('canvas').click({ position: { x: 40, y: 40 } });
    await addSubnet(page, 'LAN', '192.168.1.0/24');
    await expect(page.getByText('192.168.1.0/24')).toBeVisible();

    await selectNode(page, 'Dell OptiPlex Micro');
    await page.getByLabel('Subnet', { exact: true }).selectOption({ label: 'LAN · 192.168.1.0/24' });
    await page.getByLabel('Assign next free address').click();
    await expect(page.getByLabel('IP address')).toHaveValue('192.168.1.1');
    await expect(page.getByText('192.168.1.1', { exact: true }).first()).toBeVisible();
  });

  test('port mappings are editable and show on the node badge', async ({ page }) => {
    await newBlankProject(page);
    await place(page, 'jellyfin', 320, 240);
    const port = page.getByLabel('http host port');
    await port.fill('18096');
    await expect(page.getByText('18096/tcp')).toBeVisible();
  });

  test('inspector shows project settings when nothing is selected', async ({ page }) => {
    await newBlankProject(page);
    await expect(page.getByLabel('Electricity price')).toHaveValue('0.2');
    await page.getByLabel('Electricity price').fill('0.31');
    await expect(page.getByLabel('Electricity price')).toHaveValue('0.31');
  });
});
