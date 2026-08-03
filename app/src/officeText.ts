// Reading a .docx in the browser, without a library and without a third party.
//
// A coordinator has to be able to look at what someone sent without downloading it and
// opening it in Word. The obvious shortcut — Microsoft's or Google's online viewer —
// would mean handing the signed URL of a private document to a company that is not part
// of this operation. That is the one thing the private bucket exists to prevent
// (rules/03 §File Uploads), so the file is read here instead.
//
// A .docx is a ZIP with `word/document.xml` inside it. The browser can already inflate
// (DecompressionStream), so all that is missing is enough ZIP structure to find one
// member — about eighty lines, versus a ~500 KB dependency.
//
// Text only, on purpose. Turning the document's XML into HTML and injecting it into the
// panel would put a stranger's markup inside a coordinator's session; a preview is for
// reading, and text is what reading needs.

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
// Enough for any plausible letter or report; a preview is not an archive.
const MAX_CHARS = 200_000;

export class OfficeTextError extends Error {}

function findEocd(dv: DataView): number {
  // The end-of-central-directory record is last, followed only by an optional comment
  // (max 64 KB), so scanning backwards over that window finds it.
  const start = Math.max(0, dv.byteLength - 66_000);
  for (let i = dv.byteLength - 22; i >= start; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) return i;
  }
  throw new OfficeTextError('not-a-zip');
}

interface ZipEntry { name: string; method: number; size: number; offset: number }

function readCentralDirectory(buf: ArrayBuffer): ZipEntry[] {
  const dv = new DataView(buf);
  const eocd = findEocd(dv);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  const out: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > dv.byteLength || dv.getUint32(p, true) !== CEN_SIG) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const offset = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nameLen));
    out.push({ name, method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function readMember(buf: ArrayBuffer, e: ZipEntry): Promise<string> {
  const dv = new DataView(buf);
  if (dv.getUint32(e.offset, true) !== LOC_SIG) throw new OfficeTextError('bad-entry');
  const nameLen = dv.getUint16(e.offset + 26, true);
  const extraLen = dv.getUint16(e.offset + 28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const raw = buf.slice(start, start + e.size);

  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new OfficeTextError('unsupported-compression');
  // `deflate-raw` is the ZIP flavour (no zlib header). Available in every browser this
  // product targets; where it is missing the caller falls back to "download it".
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new OfficeTextError('no-inflate');
  const stream = new Blob([raw]).stream().pipeThrough(new DS('deflate-raw'));
  return new Response(stream).text();
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

function xmlToText(xml: string): string {
  return xml
    // Paragraph and line breaks become real breaks before the tags are dropped.
    .replace(/<w:tab\b[^>]*\/?>/g, '\t')
    .replace(/<w:br\b[^>]*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CHARS);
}

/** Extract the readable text of a .docx. Throws OfficeTextError when it cannot. */
export async function docxToText(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const entries = readCentralDirectory(buf);
  const doc = entries.find((e) => e.name === 'word/document.xml');
  if (!doc) throw new OfficeTextError('no-document-xml');
  const text = xmlToText(await readMember(buf, doc));
  if (!text) throw new OfficeTextError('empty');
  return text;
}
