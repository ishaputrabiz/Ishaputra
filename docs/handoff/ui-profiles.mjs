// Logged-in browser profiles for playwright-cli sessions (one per auditor and role), so no
// password is ever typed on a command line. Run from ssecommerce/:
//   node docs/handoff/ui-profiles.mjs <profilesDir> <name:role> [<name:role> ...]   role = shopper | admin
import { createRequire } from 'node:module';
import { readFileSync, mkdirSync } from 'node:fs';

const { chromium } = createRequire('C:/Users/chala/AppData/Roaming/npm/node_modules/playwright/package.json')('playwright');
const [dir, ...specs] = process.argv.slice(2);
const BASE = 'http://127.0.0.1:5182';

for (const spec of specs) {
  const [name, role] = spec.split(':');
  const creds = JSON.parse(readFileSync(`docs/handoff/${role === 'admin' ? 'admin' : 'shopper'}.local`, 'utf8'));
  const profile = `${dir}/${name}`;
  mkdirSync(profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { sessionStorage.setItem('appLoaded', 'true'); } catch { /* ignore */ } });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}${role === 'admin' ? '/admin' : '/login'}`, { waitUntil: 'load' });
  await page.locator('input[type="email"]').first().fill(creds.email);
  await page.locator('input[type="password"]').first().fill(creds.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL((u) => (role === 'admin' ? /dashboard/.test(u.pathname) : !/login/.test(u.pathname)), { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  console.log(`${name} (${role}): ${new URL(page.url()).pathname}`);
  await ctx.close();
}
process.exit(0);
