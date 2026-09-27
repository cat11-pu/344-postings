// indexrun.js：按处理预算处理倒排登记/词频查询，用尽预算连着载压账，收尾不限预算
import { placeOf, insertDoc } from "./index.js";

const DEFAULT_CODES = {
  bad_term_code: "E_BAD_TERM",
  bad_doc_code: "E_BAD_DOC",
  dup_code: "E_DUP_POSTING",
  missing_code: "E_NO_TERM",
  event_error_code: "E_BAD_EVENT"
};

function fail(spec, key, fallback, message) {
  const code = (spec && spec[key]) || DEFAULT_CODES[key] || fallback;
  const error = new Error(message);
  error.code = code;
  throw error;
}

function isPlainEvent(event) {
  return event !== null && typeof event === "object" && !Array.isArray(event);
}

function isPositiveInt(value) {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

// 结构与字段校验：与预算无关，先整批做完，不合法直接抛错。
function validate(spec, event) {
  if (!isPlainEvent(event)) fail(spec, "event_error_code", "E_BAD_EVENT", "事件必须是对象");
  if (event.kind !== "index" && event.kind !== "freq") {
    fail(spec, "event_error_code", "E_BAD_EVENT", "事件 kind 只能是 index 或 freq");
  }
  if (typeof event.term !== "string" || event.term === "") {
    fail(spec, "bad_term_code", "E_BAD_TERM", "词条不能为空");
  }
  if (event.kind === "index" && !isPositiveInt(event.doc)) {
    fail(spec, "bad_doc_code", "E_BAD_DOC", "文档号必须是正整数");
  }
}

function toTuple(event) {
  return event.kind === "index"
    ? ["index", event.term, event.doc]
    : ["freq", event.term, null];
}

function cloneState(state) {
  const src = state || {};
  return {
    postings: (src.postings || []).map(function (row) { return [row[0], row[1].slice()]; }),
    freqs: (src.freqs || []).map(function (row) { return [row[0], row[1]]; }),
    ledger: (src.ledger || []).map(function (row) { return row.slice(); }),
    applied: (src.applied || []).slice()
  };
}

// 对一条已通过结构校验、且确认本轮尚未处理过的事件做语义判定与落地。
function applyEvent(spec, state, event) {
  const sig = JSON.stringify(toTuple(event));
  if (event.kind === "index") {
    const slot = placeOf(state.postings, event.term);
    if (slot !== -1 && state.postings[slot][1].indexOf(event.doc) !== -1) {
      fail(spec, "dup_code", "E_DUP_POSTING", "同一词条同一文档号不能重复登记");
    }
    if (slot === -1) {
      state.postings.push([event.term, [event.doc]]);
    } else {
      state.postings[slot][1] = insertDoc(state.postings[slot][1], event.doc);
    }
  } else {
    const slot = placeOf(state.postings, event.term);
    if (slot === -1) {
      fail(spec, "missing_code", "E_NO_TERM", "词频查询的词条尚未登记");
    }
    const total = state.postings[slot][1].length;
    const freqSlot = placeOf(state.freqs, event.term);
    if (freqSlot === -1) state.freqs.push([event.term, total]);
    else state.freqs[freqSlot][1] = total;
  }
  state.applied.push(sig);
}

function budgetOf(spec) {
  const value = Number(spec && spec.budget);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

export function step(spec) {
  const input = spec || {};
  const events = input.events || [];
  const state = cloneState(input.state);

  for (let i = 0; i < events.length; i += 1) validate(spec, events[i]);

  const budget = budgetOf(input);
  // 入场时已在 applied 里的操作属于跨轮重放，幂等跳过、不花预算；
  // 本轮内刚落地的操作不在这里，后续同请求仍按当前倒排表判重复。
  const replayed = {};
  state.applied.forEach(function (sig) { replayed[sig] = true; });
  let served = 0;
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const sig = JSON.stringify(toTuple(event));
    if (replayed[sig]) continue;
    if (served >= budget) {
      state.ledger.push(toTuple(event));
      continue;
    }
    applyEvent(spec, state, event);
    served += 1;
  }

  return {
    state: state,
    served: served,
    ledger_before: state.ledger.length,
    ledger: state.ledger.map(function (row) { return row.slice(); }),
    judged: events.length,
    judged_bound: events.length
  };
}

export function close(spec) {
  const input = spec || {};
  const state = cloneState(input.state);
  const pending = state.ledger.map(function (row) { return row.slice(); });
  state.ledger = [];
  let catchup = 0;
  for (let i = 0; i < pending.length; i += 1) {
    const tuple = pending[i];
    // 账上的都是当轮没处理过的请求（跨轮重放的在 step 已跳过、不会入账），
    // 收尾按当前倒排表逐条真处理，语义不合法照样报对应错误。
    const event = tuple[0] === "index"
      ? { kind: "index", term: tuple[1], doc: tuple[2] }
      : { kind: "freq", term: tuple[1] };
    applyEvent(spec, state, event);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
