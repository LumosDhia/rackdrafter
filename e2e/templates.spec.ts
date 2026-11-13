import { expect, test } from '@playwright/test';

test.describe('reference designs', () => {
  test('the homelab template opens with the real topology', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Homelab \(real\)/ }).click();
    await expect(page.getByTestId('canvas')).toBeVisible();
    await expect(page.locator('.react-flow__node').first()).toBeVisible();

    const nodes = await page.locator('.react-flow__node').count();
    expect(nodes).toBeGreaterThan(40);

    // Host card with real facts, and a guest carrying the documented address.
    await expect(page.getByText('pve', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('192.168.1.200', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('ct-101-jellyfin', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('s.mavubo.com', { exact: true }).first()).toBeVisible();
  });

  test('the k3s template shows the cluster and the CI/CD chain', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /k3s cluster \+ CI\/CD/ }).click();
    await expect(page.getByTestId('canvas')).toBeVisible();

    await expect(page.getByText('k3s-prod', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('cp-1', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('act-runner', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('argocd', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('traefik', { exact: true }).first()).toBeVisible();
  });

  test('a template is a normal editable project', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Homelab \(real\)/ }).click();
    await expect(page.getByTestId('canvas')).toBeVisible();
    const before = await page.locator('.react-flow__node').count();
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Delete');
    await expect(page.locator('.react-flow__node')).toHaveCount(0);
    expect(before).toBeGreaterThan(0);
  });
});
