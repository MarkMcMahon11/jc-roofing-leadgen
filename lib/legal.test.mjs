// Acceptance logic for the privacy pop-up. Run: npm test  (Node's built-in test runner, no extra packages)
import { test } from "node:test";
import assert from "node:assert/strict";
import { AGREEMENT_ID, cleanConsents, defaultConsents, LEGAL_VERSION, makeAcceptance, needsAcceptance, ownerAcceptance, parseAcceptance, requiredMet } from "./legal.ts";

const ticked = { privacy: true, contact: true, aiPhotos: false, marketing: false };

test("first visit: nothing stored means the pop-up shows", () => {
  assert.equal(needsAcceptance(null), true);
  assert.equal(needsAcceptance(""), true);
  assert.equal(needsAcceptance("not json"), true);
});

test("optional consents start unticked", () => {
  const d = defaultConsents();
  assert.equal(d.aiPhotos, false);
  assert.equal(d.marketing, false);
  assert.equal(requiredMet(d), false);
});

test("required consents are enforced", () => {
  assert.equal(requiredMet({ privacy: true, contact: false }), false);
  assert.equal(requiredMet({ privacy: false, contact: true }), false);
  assert.equal(requiredMet(ticked), true);
  assert.throws(() => makeAcceptance({ privacy: true }));
  // a stored record missing a required tick is not an acceptance
  assert.equal(needsAcceptance(JSON.stringify({ version: LEGAL_VERSION, at: "2026-10-11T10:00:00Z", consents: { privacy: true } })), true);
});

test("accepted for this version: the pop-up stays hidden", () => {
  const a = makeAcceptance({ ...ticked, marketing: true });
  assert.equal(a.version, LEGAL_VERSION);
  assert.equal(needsAcceptance(JSON.stringify(a)), false);
  assert.equal(parseAcceptance(JSON.stringify(a)).consents.marketing, true);
});

test("a new LEGAL_VERSION shows the pop-up again", () => {
  const old = { ...makeAcceptance(ticked), version: "2020-01-01" };
  assert.equal(needsAcceptance(JSON.stringify(old)), true);
  assert.equal(needsAcceptance(JSON.stringify(makeAcceptance(ticked)), "2099-01-01"), true);
});

test("unknown or non-boolean consent values are dropped", () => {
  assert.deepEqual(cleanConsents({ privacy: "yes", contact: true, evil: true }), { privacy: false, contact: true, aiPhotos: false, marketing: false });
  assert.equal(cleanConsents([true]), null);
});

test("owners must also accept the agreement on behalf of the business", () => {
  assert.equal(requiredMet({ privacy: true }, "owner"), false);
  assert.equal(requiredMet({ privacy: true, [AGREEMENT_ID]: true }, "owner"), true);
  const rec = { id: "1", kind: "acceptance", userId: "owner", role: "owner", company: "JC", name: "Jamie", version: LEGAL_VERSION, consents: { privacy: true, [AGREEMENT_ID]: true }, at: "x", userAgent: "" };
  assert.equal(ownerAcceptance({ rev: 1, records: [rec], requests: [] })?.name, "Jamie");
  assert.equal(ownerAcceptance({ rev: 1, records: [{ ...rec, version: "old" }], requests: [] }), null);
});
