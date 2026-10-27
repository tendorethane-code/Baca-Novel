// Menyusun EPUB 3 (dengan toc.ncx untuk pembaca EPUB 2) dari daftar chapter.
import { writeZip } from './zip.js';
import { chapterLabel } from './parse.js';

const xmlEscape = (s) =>
  String(s)
    // Karakter kontrol tidak sah di XML dan bikin EPUB gagal dibuka.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const h = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const CSS = `body { margin: 0 5%; line-height: 1.6; }
h1 { font-size: 1.3em; text-align: center; margin: 2em 0 1.5em; }
h1 .sub { display: block; font-size: 0.8em; font-weight: normal; margin-top: 0.4em; }
p { margin: 0 0 0.8em; text-indent: 0; }
.title-page { text-align: center; margin-top: 30%; }
.title-page .author { margin-top: 1em; font-style: italic; }
.title-page .range { margin-top: 2em; font-size: 0.9em; }
`;

const page = (lang, title, body) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head>
<meta charset="utf-8"/>
<title>${xmlEscape(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`;

/**
 * opts: { title, author, lang, chapters: [{ num, title, paragraphs }] }
 * Mengembalikan Uint8Array berisi file .epub.
 */
export async function buildEpub({ title, author = '', lang = 'id', chapters }) {
  const id = `urn:uuid:${uuid()}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const L = xmlEscape(lang || 'id');
  const files = chapters.map((c, i) => ({ ...c, file: `ch${String(i + 1).padStart(4, '0')}.xhtml`, label: chapterLabel(c.num, c.title) }));
  const rangeText = chapters.length ? `Chapter ${chapters[0].num} – ${chapters[chapters.length - 1].num}` : '';

  const out = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    {
      name: 'META-INF/container.xml',
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
    },
    { name: 'OEBPS/style.css', data: CSS },
    {
      name: 'OEBPS/title.xhtml',
      data: page(
        L,
        title,
        `<div class="title-page">
<h1>${xmlEscape(title)}</h1>
${author ? `<p class="author">${xmlEscape(author)}</p>` : ''}
<p class="range">${xmlEscape(rangeText)}</p>
</div>`,
      ),
    },
  ];

  for (const f of files) {
    const head = f.title
      ? `<h1>Chapter ${xmlEscape(f.num)}<span class="sub">${xmlEscape(f.title)}</span></h1>`
      : `<h1>Chapter ${xmlEscape(f.num)}</h1>`;
    const body = f.paragraphs.map((p) => `<p>${xmlEscape(p)}</p>`).join('\n');
    out.push({ name: `OEBPS/${f.file}`, data: page(L, f.label, `<section epub:type="chapter">\n${head}\n${body}\n</section>`) });
  }

  const navItems = files.map((f) => `<li><a href="${f.file}">${xmlEscape(f.label)}</a></li>`).join('\n');
  out.push({
    name: 'OEBPS/nav.xhtml',
    data: page(L, 'Daftar Isi', `<nav epub:type="toc" id="toc">\n<h1>Daftar Isi</h1>\n<ol>\n${navItems}\n</ol>\n</nav>`),
  });

  const navPoints = files
    .map(
      (f, i) =>
        `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${xmlEscape(f.label)}</text></navLabel><content src="${f.file}"/></navPoint>`,
    )
    .join('\n');
  out.push({
    name: 'OEBPS/toc.ncx',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${id}"/><meta name="dtb:depth" content="1"/><meta name="dtb:totalPageCount" content="0"/><meta name="dtb:maxPageNumber" content="0"/></head>
<docTitle><text>${xmlEscape(title)}</text></docTitle>
<navMap>
${navPoints}
</navMap>
</ncx>
`,
  });

  const manifest = files.map((f, i) => `<item id="c${i + 1}" href="${f.file}" media-type="application/xhtml+xml"/>`).join('\n');
  const spine = files.map((f, i) => `<itemref idref="c${i + 1}"/>`).join('\n');
  out.push({
    name: 'OEBPS/content.opf',
    data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${L}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${xmlEscape(title)}</dc:title>
${author ? `<dc:creator>${xmlEscape(author)}</dc:creator>` : ''}
<dc:language>${L}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${manifest}
</manifest>
<spine toc="ncx">
<itemref idref="title"/>
${spine}
</spine>
</package>
`,
  });

  return writeZip(out);
}
