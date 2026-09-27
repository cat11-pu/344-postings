// index.js：词条定位与文档号插入（原生、无依赖）
export function placeOf(postings, term) {
  const rows = postings || [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i][0] === term) return i;
  }
  return -1;
}

export function insertDoc(docs, doc) {
  const out = (docs || []).slice();
  if (out.indexOf(doc) !== -1) return out;
  let at = 0;
  while (at < out.length && out[at] < doc) at += 1;
  out.splice(at, 0, doc);
  return out;
}
