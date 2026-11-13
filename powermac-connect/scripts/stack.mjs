#!/usr/bin/env node
// Local Supabase-compatible stack: up | down | reset | migrate | seed | status | env
// Uses Docker (dev/local-stack/docker-compose.yml). With the Supabase CLI installed you can
// instead run `supabase start` + `supabase db reset` (supabase/config.toml) - same migrations.
import { execSync, spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, openSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const STACK = join(ROOT, "dev/local-stack");
// Well-known *development* secret. Never used outside the local stack.
const JWT_SECRET = "local-dev-only-jwt-secret-powermac-connect-0123456789";
const SITE_URL = process.env.SITE_URL || "http://localhost:3100";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = createHmac("sha256", JWT_SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const exp = Math.floor(Date.UTC(2035, 0, 1) / 1000);
const ANON = sign({ iss: "supabase-local", role: "anon", exp });
const SERVICE = sign({ iss: "supabase-local", role: "service_role", exp });
const env = { ...process.env, JWT_SECRET, SITE_URL, ANON_KEY: ANON, SERVICE_KEY: SERVICE };
const sh = (cmd, opts = {}) => execSync(cmd, { cwd: STACK, env, stdio: "inherit", ...opts });
const out = (cmd) => execSync(cmd, { cwd: STACK, env, encoding: "utf8" }).trim();

function psql(file, db = "postgres") {
  const sql = readFileSync(file, "utf8");
  execSync(`docker compose exec -T db psql -1 -v ON_ERROR_STOP=1 -q -U postgres -d ${db}`, { cwd: STACK, env, input: sql, stdio: ["pipe", "inherit", "inherit"] });
}
function waitFor(label, check, tries = 120) {
  for (let i = 0; i < tries; i++) {
    try { if (check()) return; } catch {}
    execSync("sleep 1");
  }
  throw new Error(`timed out waiting for ${label}`);
}
const authReady = () => out(`docker compose exec -T db psql -U postgres -tAc "select to_regclass('auth.users') is not null and to_regclass('storage.objects') is not null and exists(select 1 from auth.schema_migrations)"`) === "t";

function migrate() {
  const dir = join(ROOT, "supabase/migrations");
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    console.log(`[migrate] ${f}`);
    psql(join(dir, f));
  }
  reloadRest();
}
function seed() {
  console.log("[seed] supabase/seed.sql (DEMO tenant)");
  psql(join(ROOT, "supabase/seed.sql"));
  reloadRest();
}
function reloadRest() {
  out(`docker compose exec -T db psql -U postgres -tAc "notify pgrst, 'reload schema'"`);
}
function writeEnv() {
  const file = join(ROOT, ".env.local");
  const keep = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter((l) => l && !/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SITE_URL)=/.test(l) && !l.startsWith("# local stack")) : [];
  writeFileSync(file, [
    "# local stack (written by scripts/stack.mjs)",
    "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321",
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON}`,
    `SUPABASE_SERVICE_ROLE_KEY=${SERVICE}`,
    `NEXT_PUBLIC_SITE_URL=${SITE_URL}`,
    ...keep,
  ].join("\n") + "\n");
  console.log(`[env] wrote ${file}`);
}
function gateway() {
  try { out("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/rest/v1/"); return console.log("[gateway] already running"); } catch {}
  mkdirSync(join(ROOT, ".local"), { recursive: true });
  const log = openSync(join(ROOT, ".local/gateway.log"), "a");
  spawn(process.execPath, [join(STACK, "gateway.mjs")], { detached: true, stdio: ["ignore", log, log] }).unref();
  waitFor("gateway", () => out("curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:54321/auth/v1/health") === "200", 30);
  console.log("[gateway] http://127.0.0.1:54321");
}

const cmd = process.argv[2] || "status";
if (cmd === "up" || cmd === "reset") {
  if (cmd === "reset") sh("docker compose down -v --remove-orphans");
  sh("docker compose up -d db auth rest storage mail");
  waitFor("auth migrations", authReady);
  // Hosted Supabase lets `postgres` manage storage policies; mirror that locally.
  out(`docker compose exec -T db psql -U supabase_admin -d postgres -tAc "grant supabase_storage_admin to postgres"`);
  const fresh = out(`docker compose exec -T db psql -U postgres -tAc "select to_regclass('public.tenants') is null"`) === "t";
  if (fresh) {
    sh("docker compose stop rest storage"); // their schema introspection can deadlock with DDL
    try { migrate(); seed(); } finally { sh("docker compose start rest storage"); }
  }
  else console.log("[migrate] schema present (use `reset` to rebuild from migrations)");
  gateway();
  writeEnv();
  console.log("\nLocal stack ready.\n  API      http://127.0.0.1:54321\n  Postgres postgresql://postgres:postgres@127.0.0.1:54322/postgres\n  Mail     http://127.0.0.1:54324\n");
} else if (cmd === "migrate" || cmd === "seed") {
  sh("docker compose stop rest storage");
  try { cmd === "migrate" ? migrate() : seed(); } finally { sh("docker compose start rest storage"); }
}
else if (cmd === "down") sh("docker compose down");
else if (cmd === "env") writeEnv();
else if (cmd === "keys") console.log(JSON.stringify({ anon: ANON, service_role: SERVICE }, null, 2));
else sh("docker compose ps");
