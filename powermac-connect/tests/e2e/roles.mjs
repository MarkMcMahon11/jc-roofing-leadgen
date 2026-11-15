#!/usr/bin/env node
// Role-based browser checks against a running app with the DEMO seed.
//   BASE_URL=http://localhost:3100 npm run test:e2e
// Verifies where each role lands, that forbidden areas are refused, that key pages render
// without server errors, and that one company cannot open another company's records.
import { createRequire } from "node:module";
// Uses an installed Playwright (npm i -D playwright && npx playwright install chromium).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const PASSWORD = process.env.DEMO_PASSWORD || "Demo-PowerMac-2026!";
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "ok  " : "FAIL"} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch();

async function session(email) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => { if (r.status() >= 500 && r.url().startsWith(BASE)) errors.push(`${r.status()} ${r.url()}`); });
  await page.goto(`${BASE}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  return { ctx, page, errors };
}
async function visit(page, path) {
  const res = await page.goto(BASE + path);
  await page.waitForLoadState("networkidle");
  return { status: res?.status() ?? 0, path: new URL(page.url()).pathname };
}

// ---------------------------------------------------------------- landing pages
const landing = {
  "director@powermac.test": "/dashboard",
  "office@powermac.test": "/dashboard",
  "finance@powermac.test": "/dashboard",
  "operative@powermac.test": "/field",
  "subcontractor@powermac.test": "/field",
  "client@kelvinbrae.test": "/portal",
  "admin@bpoai.test": "/platform",
};
for (const [email, home] of Object.entries(landing)) {
  const s = await session(email);
  await s.page.waitForURL((u) => u.pathname === home, { timeout: 10000 }).catch(() => {});
  ok(new URL(s.page.url()).pathname === home, `${email} lands on ${home}`);
  await s.ctx.close();
}

// ---------------------------------------------------------------- director: every internal page renders
{
  const s = await session("director@powermac.test");
  const pages = ["/dashboard", "/crm", "/crm/pipeline", "/contracts", "/properties", "/properties?view=map", "/jobs", "/jobs?view=list", "/jobs?view=calendar", "/jobs?view=map",
    "/schedule", "/workforce", "/subcontractors", "/settings/users", "/settings/roles", "/settings/workflow", "/settings/audit"];
  for (const p of pages) {
    const r = await visit(s.page, p);
    ok(r.status === 200 && r.path === p.split("?")[0], `director can open ${p}`);
  }
  // first job + first client detail pages
  await visit(s.page, "/jobs?view=list");
  const jobHref = await s.page.locator('a[href^="/jobs/"][href*="-"]').first().getAttribute("href");
  if (jobHref) { const r = await visit(s.page, jobHref); ok(r.status === 200, `director can open a job (${jobHref})`); }
  globalThis.__pmJob = jobHref;
  ok(s.errors.length === 0, `no server errors for director (${s.errors.slice(0, 3).join(" | ")})`);
  await s.ctx.close();
}

// ---------------------------------------------------------------- refusals
const refusals = [
  ["office@powermac.test", "/settings/users", "/no-access"],
  ["office@powermac.test", "/settings/audit", "/no-access"],
  ["finance@powermac.test", "/schedule", "/no-access"],
  ["operative@powermac.test", "/dashboard", "/field"],
  ["operative@powermac.test", "/crm", "/field"],
  ["client@kelvinbrae.test", "/dashboard", "/portal"],
  ["client@kelvinbrae.test", "/jobs", "/portal"],
  ["client@kelvinbrae.test", "/platform", "/no-access"],
];
for (const [email, path, expected] of refusals) {
  const s = await session(email);
  const r = await visit(s.page, path);
  ok(r.path === expected, `${email} is refused ${path} (went to ${r.path})`);
  await s.ctx.close();
}

// ---------------------------------------------------------------- finance visibility
{
  const s = await session("office@powermac.test");
  await visit(s.page, "/dashboard");
  ok((await s.page.locator("#finance").count()) === 0, "office administrator does not see finance figures");
  await s.ctx.close();
}

// ---------------------------------------------------------------- cross-tenant
if (globalThis.__pmJob) {
  const s = await session("director@northgate.test");
  const r = await visit(s.page, globalThis.__pmJob);
  const body = await s.page.locator("body").innerText();
  ok(r.status === 404 || /not found|could not be found/i.test(body), "another company's director cannot open a PowerMac job");
  await s.ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll role checks passed");
process.exit(failures ? 1 : 0);
