import path from 'node:path';
import { expect, test } from '@playwright/test';
import { signUp } from './helpers';

test('signs in with a new email, creates a business and lands on Import', async ({ page }) => {
  await signUp(page, 'owner-signin@example.com', 'Harbor Street Plumbing');
  await expect(page.getByText('Harbor Street Plumbing').first()).toBeVisible();
});

test('imports the sample CSV and shows its customers', async ({ page }) => {
  await signUp(page, 'owner-import@example.com', 'Import Test Co');

  await page.locator('input[type=file]').setInputFiles(path.join(__dirname, '..', 'public', 'sample-invoices.csv'));
  await expect(page.getByText('sample-invoices.csv')).toBeVisible();
  await expect(page.getByText(/\d+ customers, \d+ invoices\./)).toBeVisible();
  await expect(page.getByRole('cell', { name: /John Carter/ })).toBeVisible();

  await page.getByRole('button', { name: /^Import \d+ invoices$/ }).click();
  await expect(page).toHaveURL(/\/customers$/);
  await expect(page.getByRole('heading', { name: 'Customers' })).toBeVisible();
  await expect(page.getByText('John Carter')).toBeVisible();
  await expect(page.getByText('Maria Gonzalez')).toBeVisible();
});

test('"Try the demo" lands on Today with reminders listed', async ({ page }) => {
  await page.goto('/home');
  await page.getByRole('button', { name: 'Try the demo' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ready to send' })).toBeVisible();
});
