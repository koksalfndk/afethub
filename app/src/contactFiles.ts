// Attachments on the public contact form.
//
// This is the only place in the product where a stranger with no account can put bytes
// into our storage, so the checks live here and are repeated by the database and the
// bucket. Nothing on this path trusts a file name:
//
//  * the type is decided by the FIRST BYTES of the file, not by its extension and not by
//    the `type` the browser reports — both are attacker-chosen (rules/03 §File Uploads);
//  * images are re-encoded through a canvas, which drops EXIF (including the GPS a phone
//    camera writes) and proves the bytes really were an image;
//  * the stored object name is generated here; the visitor's name travels separately as
//    a label, so a name like "../../x" or "a.pdf.html" can never become a path.
//
// What this file cannot do is decide authorisation: the bucket is private and only a
// coordinator can read it (migration 0026). Client-side checks make honest uploads work
// and stop the obvious cases early; they are not the boundary.

import { toWebp, ImageError } from './imageUpload';

export const CONTACT_BUCKET = 'contact-files';
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES = 5;
// A photo from a modern phone is plenty at 1800px: a coordinator looking at a damaged
// roof or a letterhead needs to read it, not to print it. Together with WebP at 0.78
// this turns a 4 MB phone photo into a few hundred KB — which is the difference between
// a panel that opens on a weak connection and one that does not (rules/01).
const IMAGE_MAX_EDGE = 1800;
const IMAGE_QUALITY = 0.78;

export type ContactFileKind = 'image' | 'document';

export interface PickedFile {
  /** Object path inside the bucket, filled in after the upload. */
  path: string;
  /** The visitor's own file name — a label, never a path. */
  name: string;
  mime: string;
  bytes: number;
  kind: ContactFileKind;
  /** The bytes actually uploaded (WebP for images, the original for documents). */
  blob: Blob;
  /** What the visitor picked, before re-encoding. Shown so the saving is visible. */
  originalBytes: number;
}

export type ContactFileErrorCode = 'too-large' | 'too-many' | 'bad-type' | 'unreadable' | 'no-webp';

// `code` is a plain field, not a parameter property: the project builds with
// erasableSyntaxOnly, which rules out constructor-parameter properties.
export class ContactFileError extends Error {
  readonly code: ContactFileErrorCode;
  constructor(code: ContactFileErrorCode) {
    super(code);
    this.code = code;
  }
}

// Types we accept, and the magic bytes that prove them. HEIC/HEIF are here because half
// the photos taken on a phone are HEIC and refusing them means refusing the evidence.
// Deliberately absent: SVG and HTML (both run script), archives, and Office macro
// formats. A file we cannot recognise is refused rather than stored "just in case".
const DOC_TYPES: { mime: string; ext: string; sniff: (b: Uint8Array, f: File) => boolean }[] = [
  {
    mime: 'application/pdf', ext: 'pdf',
    sniff: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46, // %PDF
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx',
    // docx/xlsx are zip containers; the extension is what separates them, so it is only
    // consulted AFTER the container itself is confirmed.
    sniff: (b, f) => isZip(b) && f.name.toLowerCase().endsWith('.docx'),
  },
  {
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx',
    sniff: (b, f) => isZip(b) && f.name.toLowerCase().endsWith('.xlsx'),
  },
  {
    mime: 'text/csv', ext: 'csv',
    sniff: (b, f) => isPlainText(b) && f.name.toLowerCase().endsWith('.csv'),
  },
  {
    mime: 'text/plain', ext: 'txt',
    // The extension is required here even though the bytes decide everything else, and
    // for once that is the point: HTML, SVG, JS and PHP are all "plain text" by content.
    // Without this line a .html full of <script> passed as text/plain — it did, in
    // testing. Text is accepted only when the sender calls it text.
    sniff: (b, f) => isPlainText(b) && f.name.toLowerCase().endsWith('.txt'),
  },
];

const isZip = (b: Uint8Array): boolean => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07);

// No NUL bytes and no C0 control characters other than tab/newline/carriage return: that
// is what separates a text file from a binary someone renamed to .txt.
function isPlainText(b: Uint8Array): boolean {
  for (let i = 0; i < b.length; i++) {
    const c = b[i];
    if (c === 0) return false;
    if (c < 0x09 || (c > 0x0d && c < 0x20)) return false;
  }
  return true;
}

function isImageBytes(b: Uint8Array): boolean {
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return true;
  // GIF (accepted as an image to re-encode; it is not stored as GIF)
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return true;
  // RIFF....WEBP
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return true;
  // ISO-BMFF box ("ftyp") covers HEIC/HEIF and AVIF
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return true;
  return false;
}

const head = async (file: File, n = 4096): Promise<Uint8Array> =>
  new Uint8Array(await file.slice(0, n).arrayBuffer());

// Generated, ASCII-only, and short. The database's path check refuses anything else, so
// this is the shape that has to come out of here.
const safeName = (ext: string): string => {
  const rnd = (globalThis.crypto?.randomUUID?.() ?? String(Date.now())).replace(/-/g, '').slice(0, 16);
  return `${rnd}.${ext}`;
};

export const prettyBytes = (n: number): string =>
  (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Check one picked file and prepare the bytes that will be uploaded.
 * Throws ContactFileError; the caller turns the code into Turkish copy.
 */
export async function prepareFile(file: File): Promise<PreparedContactFile> {
  if (file.size > MAX_FILE_BYTES) throw new ContactFileError('too-large');
  if (file.size === 0) throw new ContactFileError('unreadable');

  let bytes: Uint8Array;
  try {
    bytes = await head(file);
  } catch {
    throw new ContactFileError('unreadable');
  }

  if (isImageBytes(bytes)) {
    // Re-encoding is the metadata strip and the proof in one step: a file that is not
    // decodable as an image never reaches the bucket.
    try {
      const { blob } = await toWebp(
        new File([file], file.name, { type: imageTypeFor(bytes) }), IMAGE_MAX_EDGE, IMAGE_QUALITY,
      );
      return {
        name: file.name.slice(0, 200), mime: 'image/webp', bytes: blob.size,
        kind: 'image', blob, objectName: safeName('webp'), originalBytes: file.size,
      };
    } catch (e) {
      if (e instanceof ImageError && e.message === 'no-webp-encoder') throw new ContactFileError('no-webp');
      throw new ContactFileError('unreadable');
    }
  }

  const doc = DOC_TYPES.find((d) => d.sniff(bytes, file));
  if (!doc) throw new ContactFileError('bad-type');
  // Documents are stored as they are. A PDF cannot be re-compressed in a browser without
  // rasterising it, which would destroy the text a coordinator needs to read — so this
  // path is honest about doing nothing rather than pretending to optimise.
  return {
    name: file.name.slice(0, 200), mime: doc.mime, bytes: file.size,
    kind: 'document', blob: file, objectName: safeName(doc.ext), originalBytes: file.size,
  };
}

// toWebp() only accepts the types it can decode; HEIC is handed over as-is and fails
// there on browsers that cannot decode it, which is the honest outcome.
function imageTypeFor(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/png'; // GIF decodes; re-encoded anyway
  return 'image/avif';
}

export const contactFileAccept = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf', '.docx', '.xlsx', '.txt', '.csv',
].join(',');

// ---- Upload -----------------------------------------------------------------
// Objects land under `<messageId>/<generated name>`, which is what lets the database tie
// every object to the message that justifies it (attach_contact_files refuses any other
// folder). Uploads happen AFTER the message row exists, so a file can never be stranded
// without a message — only a message without its files, which the panel can see.
type UploadClient = {
  storage: {
    from: (b: string) => {
      upload: (path: string, body: Blob, opts?: { contentType?: string; upsert?: boolean }) =>
        Promise<{ error: { message: string } | null }>;
    };
  };
};

export interface AttachmentRef { path: string; name: string; mime: string; bytes: number }

/** A file that passed the checks and is ready to upload. */
export type PreparedContactFile = Omit<PickedFile, 'path'> & { objectName: string };

export async function uploadContactFiles(
  db: UploadClient,
  messageId: string,
  files: PreparedContactFile[],
): Promise<AttachmentRef[]> {
  const out: AttachmentRef[] = [];
  for (const f of files.slice(0, MAX_FILES)) {
    const path = `${messageId}/${f.objectName}`;
    const { error } = await db.storage.from(CONTACT_BUCKET).upload(path, f.blob, {
      contentType: f.mime, upsert: false,
    });
    // One bad file must not lose the others, and none of it may lose the message: the
    // message is already stored by the time this runs.
    if (error) continue;
    out.push({ path, name: f.name, mime: f.mime, bytes: f.bytes });
  }
  return out;
}
