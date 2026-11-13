#!/usr/bin/env node
// Runs the pgTAP suites in supabase/tests/database against the local stack (Docker).
// Equivalent to `supabase test db` when using the Supabase CLI.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(ROOT, "supabase/tests/database");
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".test.sql")).sort()) {
  let out = "";
  try {
    out = execSync("docker compose exec -T db psql -X -q -t -A -U postgres -d postgres", {
      cwd: join(ROOT, "dev/local-stack"), env: { ...process.env, JWT_SECRET: "x" }, input: readFileSync(join(dir, f), "utf8"), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    out = (e.stdout || "") + (e.stderr || "");
  }
  const lines = out.split("\n").filter((l) => /^(ok|not ok|#|1\.\.|ERROR|psql)/.test(l.trim()));
  const bad = lines.filter((l) => /^not ok|ERROR|Looks like|psql:/.test(l.trim()));
  console.log(`\n${f}`);
  for (const l of lines) console.log("  " + l);
  if (bad.length) failed++;
}
if (failed) { console.error(`\n${failed} suite(s) failed`); process.exit(1); }
console.log("\nAll database suites passed");
