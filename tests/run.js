import assert from "node:assert";
import { placeOf, insertDoc } from "../index.js";
import { step, close } from "../indexrun.js";
import { render } from "../app.js";

const base = {
  budget: 1,
  state: { postings: [], freqs: [], ledger: [], applied: [] },
  events: [{ id: 1, kind: "index", term: "a", doc: 1 }],
  bad_term_code: "E_BAD_TERM", bad_doc_code: "E_BAD_DOC",
  dup_code: "E_DUP_POSTING", missing_code: "E_NO_TERM",
  event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("placeOf returns a number", () => {
  assert.strictEqual(typeof placeOf([["a", [1]]], "a"), "number");
});

check("insertDoc returns a list", () => {
  assert.ok(Array.isArray(insertDoc([1, 3], 2)));
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count_events, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
