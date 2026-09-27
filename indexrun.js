// indexrun.js：按处理预算处理并留账
import { placeOf, insertDoc } from "./index.js";

function codes(spec) {
  const src = spec || {};
  return {
    badEvent: src.event_error_code || "E_BAD_EVENT",
    badTerm: src.bad_term_code || "E_BAD_TERM",
    badDoc: src.bad_doc_code || "E_BAD_DOC",
    dup: src.dup_code || "E_DUP_POSTING",
    missing: src.missing_code || "E_NO_TERM"
  };
}

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function eventKey(event) {
  if (event && event.id !== undefined && event.id !== null) return "id:" + String(event.id);
  return "anon:" + JSON.stringify([event && event.kind, event && event.term,
    event && event.doc === undefined ? null : event.doc]);
}

function validate(event, code) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    fail(code.badEvent, "事件结构不合法");
  }
  if (event.kind !== "index" && event.kind !== "freq") fail(code.badEvent, "未知事件类型");
  if (typeof event.term !== "string") fail(code.badEvent, "词条缺失");
  if (event.kind === "index" && !("doc" in event)) fail(code.badEvent, "文档号缺失");
  if (event.term.length === 0) fail(code.badTerm, "词条为空");
  if (event.kind === "index" && (!Number.isInteger(event.doc) || event.doc <= 0)) {
    fail(code.badDoc, "文档号不是正整数");
  }
}

function copyState(state) {
  const src = state || {};
  return {
    postings: (src.postings || []).map(function (row) { return [row[0], row[1].slice()]; }),
    freqs: (src.freqs || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (event) { return Object.assign({}, event); }),
    applied: (src.applied || []).slice()
  };
}

function applyEvent(state, event, code) {
  const at = placeOf(state.postings, event.term);
  if (event.kind === "index") {
    if (at >= 0) {
      if (state.postings[at][1].indexOf(event.doc) >= 0) fail(code.dup, "重复登记");
      state.postings[at][1] = insertDoc(state.postings[at][1], event.doc);
    } else {
      state.postings.push([event.term, [event.doc]]);
    }
  } else {
    if (at < 0) fail(code.missing, "词条未登记");
    state.freqs.push([event.term, state.postings[at][1].length]);
  }
}

export function step(spec) {
  const code = codes(spec);
  const events = (spec && spec.events) || [];
  const state = copyState(spec && spec.state);
  events.forEach(function (event) { validate(event, code); });
  const seen = {};
  state.applied.forEach(function (key) { seen[key] = true; });
  let budget = Math.max(0, (spec && spec.budget) || 0);
  let served = 0;
  let ledgered = 0;
  events.forEach(function (event) {
    if (seen[eventKey(event)]) return;
    if (budget <= 0) {
      state.ledger.push(Object.assign({}, event));
      ledgered += 1;
      return;
    }
    budget -= 1;
    applyEvent(state, event, code);
    state.applied.push(eventKey(event));
    served += 1;
  });
  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (event) {
      return [event.kind, event.term, event.doc === undefined ? null : event.doc];
    }),
    judged: served + ledgered,
    judged_bound: events.length
  };
}

export function close(spec) {
  const code = codes(spec);
  const state = copyState(spec && spec.state);
  const pending = state.ledger;
  state.ledger = [];
  let catchup = 0;
  pending.forEach(function (event) {
    applyEvent(state, event, code);
    state.applied.push(eventKey(event));
    catchup += 1;
  });
  return { state: state, catchup: catchup };
}
