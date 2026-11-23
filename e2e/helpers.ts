import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, type Page } from '@playwright/test';

/** The server writes each sign-in link to DATA_DIR when E2E_LOG_LOGIN_LINKS=1. */
function loginLinkFor(email: string): string | undefined {
  const file = path.join(process.env.E2E_DATA_DIR!, 'e2e-login-links.log');
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const lines = text.split('\n').filter((l) => l.startsWith(`${email} `));
  return lines.at(-1)?.slice(email.length + 1);
}

/** Signs in with a fresh email through the real sign-in form and the logged link. */
export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

  let link: string | undefined;
  await expect.poll(() => (link = loginLinkFor(email)), { message: 'sign-in link in server log' }).toBeTruthy();
  await page.goto(link!);
  await page.getByRole('button', { name: 'Continue' }).click();
}

/** Signs in and creates the business on the welcome page, ending on Import. */
export async function signUp(page: Page, email: string, businessName: string) {
  await signIn(page, email);
  await expect(page.getByRole('heading', { name: 'Let’s set you up' })).toBeVisible();
  await page.getByLabel('Business name').fill(businessName);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/import/);
  await expect(page.getByRole('heading', { name: 'Import invoices' })).toBeVisible();
}
