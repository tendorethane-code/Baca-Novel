// Aturan menggabungkan data novel dari dua perangkat (lokal = L, repo = R).
// - Tiap chapter punya stempel waktu `u`; versi yang lebih baru menang.
// - Chapter yang dihapus dicatat di `del[num] = waktu hapus`; hapusan menang bila lebih baru dari versi mana pun.
// - Judul/pengarang/bahasa: yang `mu` (waktu ubah metadata) lebih baru menang.
// - Posisi baca dan status baca: yang `at` lebih baru menang.
// - Bookmark: per id, versi `at` lebih baru menang; bookmark yang dihapus dicatat di `bdel[id]`.
// Modul murni supaya bisa diuji dengan `node --test`.

const chapU = (novel, t) => t.u ?? novel.updatedAt ?? 0;
const metaU = (novel) => (novel ? (novel.mu ?? novel.createdAt ?? 0) : -1);

/**
 * Mengembalikan { novel, chapters } dengan `chapters`: Map<num, { from, u, l, r }>
 * from: 'L' (lokal lebih baru), 'R' (repo lebih baru), 'same' (versi sama), 'del' (terhapus).
 * l / r: apakah chapter itu hidup di sisi lokal / repo.
 */
export function mergeNovel(L, R) {
  const lt = new Map((L?.toc || []).map((t) => [t.num, { ...t, u: chapU(L, t) }]));
  const rt = new Map((R?.toc || []).map((t) => [t.num, { ...t, u: chapU(R, t) }]));
  const ld = L?.del || {};
  const rd = R?.del || {};
  const nums = new Set([...lt.keys(), ...rt.keys(), ...Object.keys(ld).map(Number), ...Object.keys(rd).map(Number)]);

  const toc = [];
  const del = {};
  const chapters = new Map();
  for (const num of nums) {
    const l = lt.get(num);
    const r = rt.get(num);
    const tomb = Math.max(ld[num] ?? -1, rd[num] ?? -1);
    const live = Math.max(l?.u ?? -1, r?.u ?? -1);
    if (tomb >= 0 && tomb >= live) {
      del[num] = tomb;
      chapters.set(num, { from: 'del', u: tomb, l: !!l, r: !!r });
      continue;
    }
    let from;
    let t;
    if (l && r && l.u === r.u) [from, t] = ['same', l];
    else if (l && (!r || l.u > r.u)) [from, t] = ['L', l];
    else [from, t] = ['R', r];
    toc.push({ num, title: t.title, n: t.n, u: t.u });
    chapters.set(num, { from, u: t.u, l: !!l, r: !!r });
  }
  toc.sort((a, b) => a.num - b.num);
  const delSorted = Object.fromEntries(Object.entries(del).sort((a, b) => a[0] - b[0]));

  const meta = metaU(L) >= metaU(R) ? L : R;
  const reads = [L?.lastRead, R?.lastRead].filter(Boolean).sort((a, b) => b.at - a.at);
  const statuses = [L?.status, R?.status].filter(Boolean).sort((a, b) => b.at - a.at);
  const { bookmarks, bdel } = mergeBookmarks(L, R);
  const novel = {
    id: (L || R).id,
    title: meta.title,
    author: meta.author || '',
    lang: meta.lang,
    createdAt: Math.min(L?.createdAt ?? Infinity, R?.createdAt ?? Infinity),
    mu: Math.max(metaU(L), metaU(R)),
    updatedAt: Math.max(L?.updatedAt || 0, R?.updatedAt || 0),
    toc,
    del: delSorted,
    lastRead: reads[0] || null,
    bookmarks,
    bdel,
  };
  if (statuses[0]) novel.status = statuses[0];
  if (novel.lang === undefined) delete novel.lang;
  return { novel, chapters };
}

function mergeBookmarks(L, R) {
  const lb = L?.bookmarks || {};
  const rb = R?.bookmarks || {};
  const tomb = maxMerge(L?.bdel, R?.bdel);
  const bookmarks = {};
  const bdel = {};
  for (const id of [...new Set([...Object.keys(lb), ...Object.keys(rb), ...Object.keys(tomb)])].sort()) {
    const a = lb[id];
    const b = rb[id];
    const best = !a ? b : !b ? a : a.at >= b.at ? a : b;
    if (tomb[id] != null && (!best || tomb[id] >= best.at)) bdel[id] = tomb[id];
    else if (best) bookmarks[id] = best;
  }
  return { bookmarks, bdel };
}

/** Waktu perubahan isi terakhir sebuah novel (untuk menimbang terhadap hapusan novel). */
export function novelActivity(novel) {
  return Math.max(novel.mu ?? 0, novel.createdAt ?? 0, ...novel.toc.map((t) => t.u ?? 0));
}

/** Gabung dua peta { kunci: waktu } dengan mengambil waktu terbesar. */
export function maxMerge(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? -1, v);
  return out;
}

/** JSON dengan urutan kunci tetap, supaya data yang sama selalu menghasilkan teks yang sama (tidak ada commit sia-sia). */
export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => v[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}
