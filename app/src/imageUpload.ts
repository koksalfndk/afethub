// Client-side image normalisation before upload.
//
// Everything the product stores as an image goes through here, for three reasons:
//  1. Format — the original may be a 4 MB JPEG straight off a phone. We re-encode to
//     WebP, which is what the rest of the project ships (rules/09 §8) and which cuts
//     the bytes an outdoor visitor on a weak network has to download.
//  2. Size — a 4000 px photo rendered into a 40 px avatar is pure waste. The long edge
//     is capped per use-case.
//  3. Metadata — drawing through a canvas drops EXIF, including the GPS coordinates a
//     phone camera writes. For a disaster platform that is a privacy fix, not a nicety
//     (rules/03 §File Uploads: "strip unsafe metadata where practical").
//
// The extension is never trusted: the bytes are decoded before anything is uploaded,
// so a file that is not really an image fails here rather than at display time.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

export interface WebpResult { blob: Blob; width: number; height: number }

export class ImageError extends Error {}

/**
 * Decode `file`, cap its long edge at `maxEdge`, re-encode as WebP.
 * Throws ImageError when the file is too large, of an unaccepted type, or not
 * decodable as an image.
 */
export async function toWebp(file: File, maxEdge: number, quality = 0.82): Promise<WebpResult> {
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageError('too-large');
  if (!ACCEPTED_TYPES.includes(file.type)) throw new ImageError('bad-type');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Declared as an image but not decodable — treat as a bad file, never upload it.
    throw new ImageError('not-an-image');
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('no-canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  // Safari only gained canvas WebP encoding in 14; without it we would silently upload
  // a PNG under a .webp name, so fail loudly instead.
  if (!blob || blob.type !== 'image/webp') throw new ImageError('no-webp-encoder');
  return { blob, width: w, height: h };
}

// Avatars render at 28–46 px; 512 covers 4x screens with room to spare.
export const AVATAR_MAX_EDGE = 512;
// Banner slides are full-bleed behind the copy panel.
export const BANNER_MAX_EDGE = 1600;

// A slide image is either a file that ships with the app ('/banners/x.webp') or an
// object uploaded to our own Supabase Storage bucket, recorded as 'upload:<name>'.
// The marker form is deliberate: the database never stores a host, so the app decides
// where images are fetched from and an admin cannot point the banner at a third-party
// server (rules/03 §File Uploads).
export const UPLOAD_PREFIX = 'upload:';
export const BANNER_BUCKET = 'banner-images';

export const isUploadRef = (image: string): boolean => image.startsWith(UPLOAD_PREFIX);
export const uploadObjectName = (image: string): string => image.slice(UPLOAD_PREFIX.length);

// ---- Storage helpers --------------------------------------------------------
// Resolve a stored slide image to something an <img>/background-image can use.
// A shipped path is returned untouched; an upload marker is resolved through the
// Supabase client, so the bucket's host lives in one place.
export function slideImageSrc(image: string, db: { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } } | null): string {
  if (!image) return '';
  if (!isUploadRef(image)) return image;
  if (!db) return '';
  return db.storage.from(BANNER_BUCKET).getPublicUrl(uploadObjectName(image)).data.publicUrl;
}
