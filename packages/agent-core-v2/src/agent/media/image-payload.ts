/**
 * `media` domain (L4) — base64 image-payload validation.
 *
 * Tool servers and SDK callers can attach `image_url` parts whose bytes are
 * not an image at all — e.g. a failing screenshot MCP tool that base64-encodes
 * its error message and labels it `image/png`. Providers sniff the decoded
 * bytes and reject the whole request with a 400, which bricks the session:
 * every later turn — including compaction — fails the same way. Sniff the
 * payload here and downgrade impostors to a text part so one bad attachment
 * cannot poison the conversation. Pure helper; no scoped service.
 */

import type { ContentPart } from '#/app/llmProtocol/message';

import { sniffMediaFromMagic } from './file-type';

const SNIFF_BASE64_CHARS = 1024;
const TEXT_PROBE_BASE64_CHARS = 4096;
const NOTICE_TEXT_CHARS = 500;

export type ImagePayloadCheck =
  | { readonly valid: true; readonly mimeType: string }
  | { readonly valid: false; readonly text?: string };

export function probeBase64Text(base64: string): string | undefined {
  return decodePrintableText(Buffer.from(base64.slice(0, TEXT_PROBE_BASE64_CHARS), 'base64'));
}

export function checkImagePayload(base64: string): ImagePayloadCheck {
  const head = Buffer.from(base64.slice(0, SNIFF_BASE64_CHARS), 'base64');
  const sniffed = sniffMediaFromMagic(head);
  if (sniffed?.kind === 'image') {
    return { valid: true, mimeType: sniffed.mimeType };
  }
  const text = probeBase64Text(base64);
  return text === undefined ? { valid: false } : { valid: false, text };
}

export function buildNonImagePayloadNotice(decodedText?: string): string {
  const detail =
    decodedText === undefined
      ? 'payload was not a recognizable image'
      : `payload was not an image; decoded text: ${JSON.stringify(truncate(decodedText))}`;
  return `[image_url dropped: ${detail}.]`;
}

export function sanitizeImageUrlPart(part: ContentPart): ContentPart {
  if (part.type !== 'image_url') return part;
  const url = part.imageUrl.url;
  if (!url.startsWith('data:')) return part;

  const commaIndex = url.indexOf(',');
  const header =
    commaIndex === -1 ? url.slice('data:'.length) : url.slice('data:'.length, commaIndex);
  const params = header.split(';').map((param) => param.trim().toLowerCase());
  if (commaIndex === -1 || !params.includes('base64')) {
    return { type: 'text', text: buildNonImagePayloadNotice() };
  }

  const base64 = url.slice(commaIndex + 1);
  const check = checkImagePayload(base64);
  if (!check.valid) {
    return { type: 'text', text: buildNonImagePayloadNotice(check.text) };
  }
  const declared = params[0];
  if (declared !== undefined && declared !== '' && declared !== check.mimeType) {
    return {
      type: 'image_url',
      imageUrl: { ...part.imageUrl, url: `data:${check.mimeType};base64,${base64}` },
    };
  }
  return part;
}

function truncate(text: string): string {
  return text.length <= NOTICE_TEXT_CHARS ? text : `${text.slice(0, NOTICE_TEXT_CHARS)}…`;
}

const REPLACEMENT_CHAR = '�';

function decodePrintableText(buf: Buffer): string | undefined {
  if (buf.length === 0) return undefined;
  if (buf.includes(0x00)) return undefined;
  const text = buf.toString('utf8');
  if (text.includes(REPLACEMENT_CHAR)) return undefined;
  if (hasBinaryControlChar(text)) return undefined;
  const trimmed = text.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function hasBinaryControlChar(text: string): boolean {
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x7f || (code < 0x20 && ch !== '\t' && ch !== '\n' && ch !== '\r')) {
      return true;
    }
  }
  return false;
}
