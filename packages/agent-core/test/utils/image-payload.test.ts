import type { ContentPart } from '@moonshot-ai/kosong';
import { describe, expect, test } from 'vitest';

import { checkImagePayload, sanitizeImageUrlPart } from '../../src/utils/image-payload';

// Real-world payload from a failing screenshot MCP tool: the error message
// base64-encoded and labelled image/png. It used to poison the session —
// the provider sniffs the decoded bytes and 400s every subsequent request.
const ERROR_TEXT = 'Failed to take take screenshot. Capturing failed.\n';
const ERROR_TEXT_B64 = Buffer.from(ERROR_TEXT, 'utf8').toString('base64');

const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
const ZIP_B64 = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x0a, 0x00]).toString('base64');

function imagePart(url: string): ContentPart {
  return { type: 'image_url', imageUrl: { url } };
}

describe('checkImagePayload', () => {
  test('accepts a payload whose magic bytes match an image format', () => {
    expect(checkImagePayload(PNG_B64)).toEqual({ valid: true, mimeType: 'image/png' });
    expect(checkImagePayload(JPEG_B64)).toEqual({ valid: true, mimeType: 'image/jpeg' });
  });

  test('rejects a text payload and carries the decoded message', () => {
    const check = checkImagePayload(ERROR_TEXT_B64);
    expect(check.valid).toBe(false);
    expect(check.valid === false && check.text).toBe(ERROR_TEXT.trim());
  });

  test('rejects a non-image binary payload without decoded text', () => {
    expect(checkImagePayload(ZIP_B64)).toEqual({ valid: false });
  });
});

describe('sanitizeImageUrlPart', () => {
  test('passes non-image parts through untouched', () => {
    const part: ContentPart = { type: 'text', text: 'hello' };
    expect(sanitizeImageUrlPart(part)).toBe(part);
  });

  test('passes non-data URLs through untouched', () => {
    const part = imagePart('https://example.com/img.png');
    expect(sanitizeImageUrlPart(part)).toBe(part);
    const msPart = imagePart('ms://image-1');
    expect(sanitizeImageUrlPart(msPart)).toBe(msPart);
  });

  test('keeps a data URL whose payload is a real image', () => {
    const part = imagePart(`data:image/png;base64,${PNG_B64}`);
    expect(sanitizeImageUrlPart(part)).toBe(part);
  });

  test('rewrites the declared MIME when it disagrees with the magic bytes', () => {
    const part = imagePart(`data:image/png;base64,${JPEG_B64}`);
    expect(sanitizeImageUrlPart(part)).toEqual(imagePart(`data:image/jpeg;base64,${JPEG_B64}`));
  });

  test('downgrades a text payload to a notice carrying the decoded message', () => {
    const part = imagePart(`data:image/png;base64,${ERROR_TEXT_B64}`);
    const out = sanitizeImageUrlPart(part);
    expect(out.type).toBe('text');
    const text = (out as { text: string }).text;
    expect(text).toContain('image_url dropped');
    expect(text).toContain('Failed to take take screenshot. Capturing failed.');
  });

  test('downgrades a non-image binary payload to a generic notice', () => {
    const out = sanitizeImageUrlPart(imagePart(`data:image/png;base64,${ZIP_B64}`));
    expect(out).toEqual({
      type: 'text',
      text: '[image_url dropped: payload was not a recognizable image.]',
    });
  });

  test('downgrades a data URL without a base64 payload marker', () => {
    const out = sanitizeImageUrlPart(imagePart('data:image/svg+xml,<svg/>'));
    expect(out.type).toBe('text');
  });
});
