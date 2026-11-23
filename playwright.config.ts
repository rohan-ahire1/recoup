import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// The config is loaded again in every worker, so the temp folder and port are
// picked once and passed on through the environment.
process.env.E2E_DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'recoup-e2e-'));
process.env.E2E_PORT ||= execFileSync(process.execPath, [
  '-e',
  "const s=require('net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})",
])
  .toString()
  .trim();

const port = process.env.E2E_PORT;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run start',
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'pipe',
    env: {
      PORT: port,
      PUBLIC_BASE_URL: baseURL,
      DATA_DIR: process.env.E2E_DATA_DIR,
      E2E_LOG_LOGIN_LINKS: '1',
      RESEND_API_KEY: '',
      AUTH_EMAIL_FROM: '',
    },
  },
});
