// Logo LumenRead sebagai SVG. Warna dari variabel CSS --a (utama) dan --b (terang) pada elemen induk,
// jadi logo ikut warna tema. Arsip semua konsep logo: repo baca-novel-data, folder design/logo.
//   K2 · Kristal Ukir: ikon aplikasi & layar pembuka.   D · Gerhana: di dalam aplikasi.

const STAR = (cx, cy, r) => {
  const k = r * 0.12;
  return `M${cx} ${cy - r}C${cx + k} ${cy - k} ${cx + k} ${cy - k} ${cx + r} ${cy}C${cx + k} ${cy + k} ${cx + k} ${cy + k} ${cx} ${cy + r}C${cx - k} ${cy + k} ${cx - k} ${cy + k} ${cx - r} ${cy}C${cx - k} ${cy - k} ${cx - k} ${cy - k} ${cx} ${cy - r}z`;
};
const base = (id) =>
  `<linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--b)"/><stop offset="1" stop-color="var(--a)"/></linearGradient>` +
  `<radialGradient id="k${id}"><stop offset=".6" stop-color="var(--a)" stop-opacity="0"/><stop offset=".7" stop-color="var(--a)" stop-opacity=".95"/><stop offset=".8" stop-color="var(--a)" stop-opacity=".35"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></radialGradient>` +
  `<radialGradient id="d${id}" cx=".72" cy=".28" r=".9"><stop offset="0" stop-color="var(--a)" stop-opacity=".22"/><stop offset=".5" stop-color="#05060b"/></radialGradient>`;

/** D · Gerhana: korona, piringan gelap bertepi terang, kilau cincin berlian. */
function gerhana(id) {
  return `${base(id)}
    <circle cx="60" cy="62" r="52" fill="url(#k${id})"/>
    <circle cx="60" cy="62" r="34" fill="#05060b"/><circle cx="60" cy="62" r="34" fill="url(#d${id})"/>
    <circle cx="60" cy="62" r="34.5" fill="none" stroke="url(#g${id})" stroke-width="2.6"/>
    <path d="M44 34a34 34 0 0 1 44 6" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".85"/>
    <circle cx="86" cy="38" r="5.5" fill="#fff"/><path d="${STAR(86, 38, 22)}" fill="#fff"/>
    <path d="${STAR(28, 96, 3.5)}" fill="var(--b)" opacity=".8"/>`;
}

/** K2 · Kristal Ukir: gerhana + piringan cahaya + huruf L serif (Didone) berukir di tengah. */
const LPATH = 'M47 40H63V41.4Q59 41.6 58.2 43.4V72.4H71.6Q74.6 72.2 75.4 65.6H76.7L76.1 74H47V72.6Q51 72.4 51.8 70.8V43.4Q51 41.6 47 41.4Z';
function kristalUkir(id) {
  return `${base(id)}
    <linearGradient id="dk${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--a)" stop-opacity="0"/><stop offset=".22" stop-color="var(--a)"/><stop offset=".5" stop-color="#fff"/><stop offset=".78" stop-color="var(--a)"/><stop offset="1" stop-color="var(--a)" stop-opacity="0"/></linearGradient>
    <linearGradient id="wl${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".22" stop-color="#fff" stop-opacity=".9"/><stop offset=".78" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="mg${id}" gradientUnits="userSpaceOnUse" x1="0" y1="60" x2="0" y2="75"><stop offset=".4" stop-color="#000"/><stop offset="1" stop-color="#fff"/></linearGradient>
    <linearGradient id="lf${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="var(--b)"/><stop offset="1" stop-color="var(--a)"/></linearGradient>
    <mask id="fm${id}" maskUnits="userSpaceOnUse" x="-10" y="40" width="140" height="60"><rect x="-10" y="40" width="140" height="60" fill="url(#mg${id})"/></mask>
    <filter id="sb${id}" filterUnits="userSpaceOnUse" x="-10" y="45" width="140" height="50"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="lb${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2"/></filter>
    <circle cx="60" cy="60" r="52" fill="url(#k${id})"/>
    <g transform="rotate(-12 60 69)"><ellipse cx="60" cy="69" rx="52" ry="10" fill="none" stroke="url(#dk${id})" stroke-width="4" opacity=".28" filter="url(#sb${id})"/><ellipse cx="60" cy="69" rx="52" ry="10" fill="none" stroke="url(#wl${id})" stroke-width=".7" opacity=".45"/></g>
    <circle cx="60" cy="60" r="32" fill="#05060b"/><circle cx="60" cy="60" r="32" fill="url(#d${id})"/>
    <circle cx="60" cy="60" r="32.5" fill="none" stroke="url(#g${id})" stroke-width="2.4"/>
    <path d="M44 33a32 32 0 0 1 42 6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" opacity=".85"/>
    <circle cx="60" cy="60" r="27" fill="none" stroke="var(--b)" stroke-width=".5" opacity=".35"/>
    <g transform="translate(60 58.5) scale(.92) translate(-61.85 -57)">
      <path d="${LPATH}" fill="var(--a)" opacity=".55" filter="url(#lb${id})"/><path d="${LPATH}" fill="url(#lf${id})"/>
      <path d="M55 44.2V71.2H73.2" fill="none" stroke="#04050c" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="${LPATH}" fill="none" stroke="#fff" stroke-width=".4" opacity=".7"/>
    </g>
    <g transform="rotate(-12 60 69)" mask="url(#fm${id})">
      <ellipse cx="60" cy="69" rx="52" ry="10" fill="none" stroke="url(#dk${id})" stroke-width="4.2" filter="url(#sb${id})"/>
      <ellipse cx="60" cy="69" rx="52" ry="10" fill="none" stroke="url(#wl${id})" stroke-width="1.1"/></g>
    <circle cx="85" cy="36" r="5.5" fill="#fff"/><path d="${STAR(85, 36, 21)}" fill="#fff"/>`;
}

let seq = 0;
/** SVG logo ('k2' atau 'd') sebagai teks. `id` membuat nama gradien unik bila ada beberapa logo di satu halaman. */
export function logoSvg(kind = 'd', id = `lg${++seq}`) {
  const body = kind === 'k2' ? kristalUkir(id) : gerhana(id);
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;
}
