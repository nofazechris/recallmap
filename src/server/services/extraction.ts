import { createHash } from 'node:crypto';

export interface ExtractedPage { page: number | null; text: string }
export interface Extraction { pages: ExtractedPage[]; pageCount: number | null }
export interface Chunk { index: number; content: string; pageNumber: number | null; hash: string }

/** Why a document couldn't be turned into study material — always shown to the user as-is. */
export class ExtractionError extends Error {
  constructor(public code: 'unsupported' | 'empty' | 'scanned' | 'too_large' | 'unreadable', message: string) {
    super(message);
  }
}

export const ALLOWED = {
  pdf: { ext: ['.pdf'], mime: ['application/pdf'] },
  txt: { ext: ['.txt'], mime: ['text/plain'] },
  md: { ext: ['.md', '.markdown'], mime: ['text/markdown', 'text/x-markdown', 'text/plain'] },
  docx: { ext: ['.docx'], mime: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
} as const;
export type Kind = keyof typeof ALLOWED;

export const MAX_TEXT_CHARS = 1_500_000;
export const MAX_CHUNKS = 400;
const MIN_PDF_CHARS = 120;

/** Decide the file kind from name + declared type. The bytes are checked again when processing. */
export function detectKind(filename: string, mime: string): Kind | null {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  for (const [kind, rule] of Object.entries(ALLOWED) as [Kind, (typeof ALLOWED)[Kind]][]) {
    if ((rule.ext as readonly string[]).includes(ext) && ((rule.mime as readonly string[]).includes(mime) || mime === 'application/octet-stream' || mime === '')) return kind;
  }
  return null;
}

const looksBinary = (buf: Buffer) => {
  const sample = buf.subarray(0, 4096);
  let bad = 0;
  for (const b of sample) if (b === 0 || (b < 9) || (b > 13 && b < 32)) bad++;
  return sample.length > 0 && bad / sample.length > 0.02;
};

export const normalise = (s: string) =>
  s.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();

export async function extract(kind: Kind, buf: Buffer): Promise<Extraction> {
  if (buf.length === 0) throw new ExtractionError('empty', 'This file is empty.');

  if (kind === 'pdf') {
    if (buf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ExtractionError('unreadable', 'This does not look like a valid PDF.');
    const { getDocumentProxy, extractText } = await import('unpdf');
    let pages: string[] = [];
    try {
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await extractText(pdf, { mergePages: false });
      pages = res.text as string[];
    } catch {
      throw new ExtractionError('unreadable', 'We couldn’t read this PDF. It may be damaged or password-protected.');
    }
    const out = pages.map((t, i) => ({ page: i + 1, text: normalise(t) })).filter((p) => p.text);
    const total = out.reduce((n, p) => n + p.text.length, 0);
    if (total < MIN_PDF_CHARS) {
      throw new ExtractionError('scanned', 'This PDF has almost no selectable text — it looks like a scan. Scanned documents aren’t supported yet; upload a text-based PDF, or paste the text as a .txt file.');
    }
    return { pages: out, pageCount: pages.length };
  }

  if (kind === 'docx') {
    if (buf.subarray(0, 2).toString('latin1') !== 'PK') throw new ExtractionError('unreadable', 'This does not look like a valid Word document.');
    const mammoth = await import('mammoth');
    let text = '';
    try { text = (await mammoth.extractRawText({ buffer: buf })).value; } catch {
      throw new ExtractionError('unreadable', 'We couldn’t read this Word document.');
    }
    const t = normalise(text);
    if (!t) throw new ExtractionError('empty', 'No text was found in this document.');
    return { pages: [{ page: null, text: t }], pageCount: null };
  }

  if (looksBinary(buf)) throw new ExtractionError('unreadable', 'This looks like a binary file, not plain text.');
  const t = normalise(buf.toString('utf8'));
  if (!t) throw new ExtractionError('empty', 'No text was found in this file.');
  return { pages: [{ page: null, text: t }], pageCount: null };
}

/**
 * Split into ~1,800-character chunks on paragraph then sentence boundaries, never across pages,
 * so a chunk's page number is always accurate.
 */
export function chunk(pages: ExtractedPage[], target = 1800): Chunk[] {
  const total = pages.reduce((n, p) => n + p.text.length, 0);
  if (total > MAX_TEXT_CHARS) throw new ExtractionError('too_large', `This document has about ${Math.round(total / 1000)}k characters of text — the limit is ${MAX_TEXT_CHARS / 1000}k. Split it into smaller files.`);

  const out: Chunk[] = [];
  const push = (content: string, page: number | null) => {
    const c = content.trim();
    if (c.length < 20 && out.length) { // fold tiny tails into the previous chunk of the same page
      const prev = out[out.length - 1];
      if (prev.pageNumber === page) { prev.content += `\n${c}`; prev.hash = hash(prev.content); return; }
    }
    if (c) out.push({ index: out.length, content: c, pageNumber: page, hash: hash(c) });
  };

  for (const p of pages) {
    let buf = '';
    for (const para of p.text.split(/\n{2,}/)) {
      const pieces = para.length > target ? para.match(/[^.!?\n]+[.!?]*\s*|\n/g) ?? [para] : [para];
      for (const piece of pieces) {
        if (buf.length + piece.length + 2 > target && buf) { push(buf, p.page); buf = ''; }
        buf += (buf ? '\n\n' : '') + piece;
        if (buf.length > target * 1.5) { push(buf.slice(0, target), p.page); buf = buf.slice(target); }
      }
    }
    push(buf, p.page);
  }
  if (out.length > MAX_CHUNKS) throw new ExtractionError('too_large', 'This document is too long to process in one go. Split it into smaller files.');
  return out.map((c, i) => ({ ...c, index: i }));
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 32);
