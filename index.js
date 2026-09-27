// index.js：词条定位与文档号插入
export function placeOf(postings, term) {
  for (let i = 0; i < postings.length; i += 1) {
    if (postings[i] && postings[i][0] === term) return i;
  }
  return -1;
}

export function insertDoc(docs, doc) {
  const next = [];
  let placed = false;
  for (let i = 0; i < docs.length; i += 1) {
    if (docs[i] === doc) return docs.slice();
    if (!placed && docs[i] > doc) { next.push(doc); placed = true; }
    next.push(docs[i]);
  }
  if (!placed) next.push(doc);
  return next;
}
