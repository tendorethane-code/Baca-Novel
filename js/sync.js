// Sinkronisasi lewat repo GitHub PRIVAT milik pengguna (terpisah dari repo kode aplikasi).
// Isi repo data:
//   library.json             daftar novel, daftar isi (dengan stempel waktu), posisi baca, catatan hapusan
//   novels/<id>/<blok>.json  isi chapter, dikelompokkan per 50 nomor chapter supaya jumlah file & request sedikit
// Satu kali sinkron = paling banyak satu commit, dibuat lewat Git Data API.

import * as db from './db.js';
import { mergeNovel, novelActivity, maxMerge, stableStringify } from './merge.js';

const CFG_KEY = 'baca-novel:sync';
const API = 'https://api.github.com';
const CHUNK = 50;
const FORMAT = 1;

const chunkKey = (num) => String(Math.floor(num / CHUNK)).padStart(4, '0');
const chunkPath = (id, key) => `novels/${id}/${key}.json`;

export function loadConfig() {
  try {
    const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return c?.repo && c?.token ? c : null;
  } catch {
    return null;
  }
}
export function saveConfig(cfg) {
  try {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  } catch {}
}
export function clearConfig() {
  try {
    localStorage.removeItem(CFG_KEY);
  } catch {}
}

/** Terima "pemilik/repo" atau URL github.com/pemilik/repo. */
export function parseRepo(input) {
  const m = /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(input.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return 'iPad';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Mac/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux/.test(ua)) return 'Linux';
  return 'perangkat';
}

class SyncError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function explain(status, body) {
  if (status === 401) return 'Token ditolak GitHub (salah atau kedaluwarsa). Buat token baru lalu hubungkan ulang.';
  if (status === 403 && /rate limit/i.test(body)) return 'Batas permintaan GitHub tercapai. Coba lagi beberapa menit lagi.';
  if (status === 403) return 'Token tidak punya izin. Pastikan izin "Contents: Read and write" untuk repo ini.';
  if (status === 404) return 'Repo tidak ditemukan, atau token tidak diberi akses ke repo ini.';
  return `GitHub menjawab ${status}. ${body.slice(0, 160)}`;
}

// Tanpa `repo`, path dihitung dari akar API (mis. '/user').
function client({ repo, token }) {
  const base = repo ? `${API}/repos/${repo}` : API;
  async function req(method, path, body, raw = false) {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('Tidak bisa menghubungi GitHub. Periksa koneksi internet.', 0);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new SyncError(explain(res.status, text), res.status);
    }
    if (res.status === 204) return null;
    return raw ? res.text() : res.json();
  }
  return {
    req,
    blob: (sha) => req('GET', `/git/blobs/${sha}`, null, true),
    async head(branch) {
      try {
        return (await req('GET', `/git/ref/heads/${encodeURIComponent(branch)}`)).object.sha;
      } catch (e) {
        if (e.status === 409 || e.status === 404) return null; // repo masih kosong
        throw e;
      }
    },
  };
}

/** Memeriksa repo: harus ada, bisa diakses, dan PRIVAT. */
export async function checkRepo(cfg) {
  const info = await client(cfg).req('GET', '');
  if (!info.private) {
    throw new SyncError(
      'Repo ini PUBLIK, jadi isi novel bisa dibaca siapa saja. Ubah repo menjadi Private (Settings → General → Danger Zone) atau pakai repo lain.',
      0,
    );
  }
  return info;
}

export const DEFAULT_REPO_NAME = 'baca-novel-data';

/**
 * Menerima "nama-repo", "pemilik/nama-repo", atau URL GitHub, lalu mengembalikan "pemilik/nama-repo" yang
 * benar-benar bisa diakses token. Kalau bagian pemilik salah (mis. diisi nama perangkat), dicoba ulang
 * dengan akun pemilik token.
 */
export async function resolveRepo(input, token) {
  const raw = input.trim() || DEFAULT_REPO_NAME;
  const full = parseRepo(raw);
  const name = full ? full.split('/')[1] : /^[\w.-]+$/.test(raw) ? raw : null;
  if (!name) throw new SyncError('Nama repo tidak valid. Cukup tulis nama repo-nya, misalnya baca-novel-data.', 0);

  const login = (await client({ token }).req('GET', '/user')).login;
  const candidates = [...new Set([full, `${login}/${name}`].filter(Boolean))];
  let notFound = null;
  for (const repo of candidates) {
    try {
      await checkRepo({ repo, token });
      return repo;
    } catch (e) {
      if (e.status !== 404) throw e;
      notFound = e;
    }
  }
  throw new SyncError(
    `Repo "${login}/${name}" tidak ditemukan, atau token belum diberi akses ke repo itu. ` +
      `Periksa nama repo-nya (akun kamu: ${login}), lalu pastikan saat membuat token kamu memilih ` +
      `"Only select repositories" → ${name}, dan izin "Contents: Read and write".`,
    notFound.status,
  );
}

/**
 * Menjalankan satu sinkronisasi penuh. Mengembalikan ringkasan:
 * { down: chapter diunduh, up: chapter diunggah, newNovels, removed, committed }
 */
export async function syncNow(cfg) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await syncOnce(cfg);
    } catch (e) {
      // 422 saat update ref = perangkat lain baru saja menyimpan. Ulangi dengan data terbaru.
      if (e.retry && attempt < 3) continue;
      throw e;
    }
  }
}

const coverPath = (id) => `covers/${id}.json`;

async function syncOnce(cfg) {
  const gh = client(cfg);
  const info = await checkRepo(cfg);
  const branch = info.default_branch || 'main';

  let head = await gh.head(branch);
  if (!head) {
    // Git Data API tidak bisa dipakai di repo kosong; buat commit pertama lewat Contents API.
    await gh.req('PUT', '/contents/README.md', {
      message: 'Mulai data LumenRead',
      content: btoa('Data sinkron aplikasi LumenRead. Jangan diubah manual.\n'),
    });
    head = await gh.head(branch);
  }
  const commit = await gh.req('GET', `/git/commits/${head}`);
  const tree = await gh.req('GET', `/git/trees/${commit.tree.sha}?recursive=1`);
  const files = new Map(tree.tree.filter((t) => t.type === 'blob').map((t) => [t.path, t.sha]));

  const remoteRaw = files.has('library.json') ? await gh.blob(files.get('library.json')) : null;
  const remote = remoteRaw ? JSON.parse(remoteRaw) : { format: FORMAT, novels: {}, deletedNovels: {} };
  if (remote.format > FORMAT) throw new SyncError('Data sinkron dibuat versi aplikasi yang lebih baru. Muat ulang aplikasi.', 0);

  const local = await db.exportState();
  const localById = new Map(local.novels.map((n) => [n.id, n]));
  const deletedNovels = maxMerge(local.deletedNovels, remote.deletedNovels);
  const out = { format: FORMAT, novels: {}, deletedNovels };
  const uploads = new Map(); // path -> isi baru, atau null = hapus file
  const plan = { novels: [], removeIds: [], deletedNovels, covers: [] };
  const stats = { down: 0, up: 0, newNovels: 0, removed: 0, committed: false };

  for (const id of new Set([...localById.keys(), ...Object.keys(remote.novels)])) {
    const L = localById.get(id);
    const R = remote.novels[id];
    const { novel, chapters } = mergeNovel(L, R);

    const delAt = deletedNovels[id];
    if (delAt != null && delAt >= novelActivity(novel)) {
      if (L) {
        plan.removeIds.push(id);
        stats.removed++;
      }
      for (const p of files.keys()) if (p.startsWith(`novels/${id}/`) || p === coverPath(id)) uploads.set(p, null);
      continue;
    }
    if (!L) stats.newNovels++;

    const byChunk = new Map();
    for (const [num, c] of chapters) {
      const k = chunkKey(num);
      if (!byChunk.has(k)) byChunk.set(k, []);
      byChunk.get(k).push([num, c]);
    }

    const puts = [];
    for (const [k, list] of byChunk) {
      const path = chunkPath(id, k);
      const needDown = list.some(([, c]) => c.from === 'R');
      const needUp = list.some(([, c]) => c.from === 'L' || (c.from === 'del' && c.r));
      let remoteChunk = new Map();
      if (needDown && files.has(path)) {
        remoteChunk = new Map(JSON.parse(await gh.blob(files.get(path))).chapters.map((c) => [c.num, c]));
        for (const [num, c] of list) {
          const rc = remoteChunk.get(num);
          if (c.from === 'R' && rc && rc.u === c.u) {
            puts.push(rc);
            stats.down++;
          }
        }
      }
      if (!needUp) continue;
      const content = [];
      for (const [num, c] of list.sort((a, b) => a[0] - b[0])) {
        if (c.from === 'del') continue;
        if (c.from === 'R') {
          if (remoteChunk.has(num)) content.push(remoteChunk.get(num));
          continue;
        }
        const lc = await db.getChapter(id, num);
        if (!lc) continue;
        content.push({ num, title: lc.title, paragraphs: lc.paragraphs, u: c.u });
        if (c.from === 'L') stats.up++;
      }
      if (content.length) uploads.set(path, JSON.stringify({ chapters: content }));
      else if (files.has(path)) uploads.set(path, null);
    }

    // Sampul: file terpisah covers/<id>.json = { u, data }. Sisi dengan cover.u lebih baru menang.
    const lc = L?.cover;
    const rc = R?.cover;
    const cpath = coverPath(id);
    if (rc && (!lc || rc.u > lc.u)) {
      if (rc.del) plan.covers.push({ novelId: id, data: null, u: rc.u });
      else if (files.has(cpath)) {
        const c = JSON.parse(await gh.blob(files.get(cpath)));
        if (c.u === rc.u) plan.covers.push({ novelId: id, data: c.data, u: c.u });
      }
    } else if (lc && (!rc || lc.u > rc.u)) {
      if (lc.del) {
        if (files.has(cpath)) uploads.set(cpath, null);
      } else {
        const data = await db.getCover(id);
        if (data) uploads.set(cpath, JSON.stringify({ u: lc.u, data }));
      }
    }

    plan.novels.push({ novel, puts });
    out.novels[id] = novel;
  }

  const libraryRaw = stableStringify(out);
  if (libraryRaw !== (remoteRaw && stableStringify(remote))) uploads.set('library.json', libraryRaw);

  await db.applySync(plan);

  if (uploads.size) {
    const entries = [];
    for (const [path, content] of uploads) {
      const sha = content === null ? null : (await gh.req('POST', '/git/blobs', { content, encoding: 'utf-8' })).sha;
      entries.push({ path, mode: '100644', type: 'blob', sha });
    }
    const newTree = await gh.req('POST', '/git/trees', { base_tree: commit.tree.sha, tree: entries });
    const newCommit = await gh.req('POST', '/git/commits', {
      message: `Sinkron dari ${deviceName()}`,
      tree: newTree.sha,
      parents: [head],
    });
    try {
      await gh.req('PATCH', `/git/refs/heads/${encodeURIComponent(branch)}`, { sha: newCommit.sha, force: false });
    } catch (e) {
      if (e.status === 422) e.retry = true;
      throw e;
    }
    stats.committed = true;
  }
  return stats;
}
