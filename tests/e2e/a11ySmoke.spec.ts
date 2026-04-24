/**
 * Minimal axe-core scan on stable shell regions (see remediation plan Sprint 4).
 * Scope is intentionally narrow to avoid flaking on full-page third-party widgets.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Accessibility smoke | Axe', () => {
  test('primary nav has no axe violations', async ({ page }) => {
    await page.goto('/');
    const { violations } = await new AxeBuilder({ page }).include('nav').analyze();
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });
});
