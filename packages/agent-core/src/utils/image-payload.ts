/**
 * image-payload — sniff base64 image payloads before they reach a provider.
 *
 * Tool servers and SDK callers can attach `image_url` parts whose bytes are
 * not an image at all — e.g. a failing screenshot MCP tool that base64-encodes
 * its error message and labels it `image/png`. Providers sniff the decoded
 * bytes and reject the whole request with a 400, which bricks the session:
 * every later turn — including compaction — fails the same way. Sniff the
 * payload here and downgrade impostors to a text part so one bad attachment
 * cannot poison the conversation.
 */

import type { ContentPart } from '@moonshot-ai/kosong';

import { sniffMediaFromMagic } from '../tools/support/file-type';

/** Base64 chars covering the 512-byte magic-byte sniff window. */
const SNIFF_BASE64_CHARS = 1024;
/** Cap on base64 chars decoded when probing for a printable text payload. */
const TEXT_PROBE_BASE64_CHARS = 4096;
/** Cap on decoded text echoed in the drop notice. */
const NOTICE_TEXT_CHARS = 500;

export type ImagePayloadCheck =
  | { readonly valid: true; readonly mimeType: string }
  | { readonly valid: false; readonly text?: string };

/**
 * Sniff a base64 payload claimed to be an image. Valid when the magic bytes
 * match a known image format; the sniffed MIME type is authoritative. When
 * the payload is printable text instead (a common shape for tool error
 * messages), the decoded text rides along so the caller can show the model
 * what the tool actually said.
 */
export function checkImagePayload(base64: string): ImagePayloadCheck {
  const head = Buffer.from(base64.slice(0, SNIFF_BASE64_CHARS), 'base64');
  const sniffed = sniffMediaFromMagic(head);
  if (sniffed?.kind === 'image') {
    return { valid: true, mimeType: sniffed.mimeType };
  }
  const text = decodePrintableText(Buffer.from(base64.slice(0, TEXT_PROBE_BASE64_CHARS), 'base64'));
  return text === undefined ? { valid: false } : { valid: false, text };
}

/**
 * Return `part` unchanged when it is not an `image_url`, or when the URL is
 * not a data URL (remote references pass through untouched). For data URLs,
 * keep parts whose payload sniffs as a real image — rewriting the declared
 * MIME when it disagrees with the magic bytes — and downgrade anything else
 * to a text notice so a single malformed attachment cannot poison every
 * subsequent provider request.
 */
export function sanitizeImageUrlPart(part: ContentPart): ContentPart {
  if (part.type !== 'image_url') return part;
  const url = part.imageUrl.url;
  if (!url.startsWith('data:')) return part;

  const commaIndex = url.indexOf(',');
  const header =
    commaIndex === -1 ? url.slice('data:'.length) : url.slice('data:'.length, commaIndex);
  const params = header.split(';').map((param) => param.trim().toLowerCase());
  if (commaIndex === -1 || !params.includes('base64')) {
    return dropNotice();
  }

  const base64 = url.slice(commaIndex + 1);
  const check = checkImagePayload(base64);
  if (!check.valid) {
    return dropNotice(check.text);
  }
  const declared = params[0];
  if (declared !== undefined && declared !== '' && declared !== check.mimeType) {
    // The declared MIME disagrees with the magic bytes. Providers validate
    // the declared type too, so rewrite it to the sniffed one.
    return {
      type: 'image_url',
      imageUrl: { url: `data:${check.mimeType};base64,${base64}` },
    };
  }
  return part;
}

function dropNotice(text?: string): ContentPart {
  const detail =
    text === undefined
      ? 'payload was not a recognizable image'
      : `payload was not an image; decoded text: ${JSON.stringify(truncate(text))}`;
  return { type: 'text', text: `[image_url dropped: ${detail}.]` };
}

function truncate(text: string): string {
  return text.length <= NOTICE_TEXT_CHARS ? text : `${text.slice(0, NOTICE_TEXT_CHARS)}…`;
}

const REPLACEMENT_CHAR = '\uFFFD';

function decodePrintableText(buf: Buffer): string | undefined {
  if (buf.length === 0) return undefined;
  if (buf.includes(0x00)) return undefined;
  const text = buf.toString('utf8');
  // A replacement char means the bytes were not valid UTF-8.
  if (text.includes(REPLACEMENT_CHAR)) return undefined;
  if (hasBinaryControlChar(text)) return undefined;
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Control characters other than tab/newline/carriage-return mark binary data. */
function hasBinaryControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x7f || (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r')) {
      return true;
    }
  }
  return false;
}
