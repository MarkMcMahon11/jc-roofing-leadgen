import { promises as fs } from "fs";
import path from "path";
import type { Lead, Settings } from "./types";

// MVP storage: JSON files. Swap for Postgres/Supabase before deploying to a serverless host.
const dir = path.join(process.cwd(), "data");

export async function getSettings(): Promise<Settings> {
  return JSON.parse(await fs.readFile(path.join(dir, "settings.json"), "utf8"));
}
export async function saveSettings(s: Settings) {
  await fs.writeFile(path.join(dir, "settings.json"), JSON.stringify(s, null, 2));
}
export async function getLeads(): Promise<Lead[]> {
  return JSON.parse(await fs.readFile(path.join(dir, "leads.json"), "utf8"));
}
export async function saveLeads(l: Lead[]) {
  await fs.writeFile(path.join(dir, "leads.json"), JSON.stringify(l, null, 2));
}
export async function addLead(lead: Lead) {
  const leads = await getLeads();
  leads.unshift(lead);
  await saveLeads(leads);
}
