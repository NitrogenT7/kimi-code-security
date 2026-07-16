import { ContentBlockSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ContentPart } from '@moonshot-ai/kosong';
import { describe, expect, test } from 'vitest';

import { convertMCPContentBlock, mcpResultToExecutableOutput } from '../../src/mcp/output';
import type { MCPContentBlock, MCPToolResult } from '../../src/mcp/types';

const MCP_OUTPUT_TRUNCATED_TEXT =
  '\n\n[Output truncated: exceeded 100000 character limit. ' +
  'Use pagination or more specific queries to get remaining content.]';

// Image payloads must carry real magic bytes: convertMCPContentBlock sniffs
// the bytes and downgrades impostors (e.g. a tool that base64-encodes an
// error message and labels it image/png) to a text notice.
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');
const WEBP_B64 = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
]).toString('base64');
/** Unpadded PNG signature — safe prefix for concatenated oversized payloads. */
const PNG_PREFIX = 'iVBORw0KGgo';

/**
 * Assert a test fixture matches the MCP SDK's ContentBlock schema. This
 * guards against fixtures that drift from the real protocol shape — exactly
 * the failure mode that previously hid the EmbeddedResource bug.
 */
function assertValidMcpBlock<T extends MCPContentBlock>(block: T): T {
  const parsed = ContentBlockSchema.safeParse(block);
  if (!parsed.success) {
    throw new Error(`fixture is not a valid MCP ContentBlock: ${parsed.error.message}`);
  }
  return block;
}

describe('convertMCPContentBlock', () => {
  test('converts text block to TextPart', () => {
    const block: MCPContentBlock = { type: 'text', text: 'hello' };
    expect(convertMCPContentBlock(block)).toEqual({ type: 'text', text: 'hello' });
  });

  test('converts image block with mimeType to image data URI', () => {
    const block: MCPContentBlock = { type: 'image', data: JPEG_B64, mimeType: 'image/jpeg' };
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'image_url',
      imageUrl: { url: `data:image/jpeg;base64,${JPEG_B64}` },
    });
  });

  test('image block without mimeType defaults to image/png', () => {
    const block: MCPContentBlock = { type: 'image', data: PNG_B64 };
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'image_url',
      imageUrl: { url: `data:image/png;base64,${PNG_B64}` },
    });
  });

  test('rewrites the declared mimeType when the magic bytes disagree', () => {
    const block: MCPContentBlock = { type: 'image', data: JPEG_B64, mimeType: 'image/png' };
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'image_url',
      imageUrl: { url: `data:image/jpeg;base64,${JPEG_B64}` },
    });
  });

  test('downgrades an image block whose payload is text to a text part', () => {
    // A failing screenshot tool that base64-encodes its error message must
    // not poison the session: providers sniff the bytes and 400 every request.
    const text = 'Failed to take take screenshot. Capturing failed.\n';
    const block: MCPContentBlock = {
      type: 'image',
      data: Buffer.from(text, 'utf8').toString('base64'),
      mimeType: 'image/png',
    };
    const part = convertMCPContentBlock(block);
    expect(part?.type).toBe('text');
    const notice = (part as { text: string }).text;
    expect(notice).toContain('image_url dropped');
    expect(notice).toContain('Failed to take take screenshot. Capturing failed.');
  });

  test('converts audio block to AudioURLPart with audio/mpeg default', () => {
    const block: MCPContentBlock = { type: 'audio', data: 'BBB' };
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'audio_url',
      audioUrl: { url: 'data:audio/mpeg;base64,BBB' },
    });
  });

  test('converts audio block with custom mimeType', () => {
    const block: MCPContentBlock = { type: 'audio', data: 'BBB', mimeType: 'audio/wav' };
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'audio_url',
      audioUrl: { url: 'data:audio/wav;base64,BBB' },
    });
  });

  test('converts text EmbeddedResource to TextPart', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: {
        uri: 'file:///project/src/main.rs',
        mimeType: 'text/x-rust',
        text: 'fn main() {}',
      },
    });
    expect(convertMCPContentBlock(block)).toEqual({ type: 'text', text: 'fn main() {}' });
  });

  test('text EmbeddedResource preserves text regardless of mimeType', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///x.json', mimeType: 'application/json', text: '{"a":1}' },
    });
    expect(convertMCPContentBlock(block)).toEqual({ type: 'text', text: '{"a":1}' });
  });

  test('converts blob EmbeddedResource with image/* mimeType to ImageURLPart', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///pic.webp', mimeType: 'image/webp', blob: WEBP_B64 },
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'image_url',
      imageUrl: { url: `data:image/webp;base64,${WEBP_B64}` },
    });
  });

  test('downgrades a blob EmbeddedResource whose payload is not an image', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: {
        uri: 'file:///pic.webp',
        mimeType: 'image/webp',
        blob: Buffer.from('not an image', 'utf8').toString('base64'),
      },
    });
    const part = convertMCPContentBlock(block);
    expect(part?.type).toBe('text');
    expect((part as { text: string }).text).toContain('image_url dropped');
  });

  test('converts blob EmbeddedResource with audio/* mimeType to AudioURLPart', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///clip.wav', mimeType: 'audio/wav', blob: 'AUD' },
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'audio_url',
      audioUrl: { url: 'data:audio/wav;base64,AUD' },
    });
  });

  test('converts blob EmbeddedResource with video/* mimeType to VideoURLPart', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///clip.mp4', mimeType: 'video/mp4', blob: 'VID' },
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'video_url',
      videoUrl: { url: 'data:video/mp4;base64,VID' },
    });
  });

  test('returns null for blob EmbeddedResource with unsupported mimeType', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///doc.pdf', mimeType: 'application/pdf', blob: 'XXX' },
    });
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('blob EmbeddedResource defaults to application/octet-stream and returns null', () => {
    const block = assertValidMcpBlock({
      type: 'resource',
      resource: { uri: 'file:///unknown', blob: 'XXX' },
    });
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('returns null for resource block missing resource field', () => {
    // Spec-illegal shape — guards the runtime branch, so skip schema validation.
    const block = { type: 'resource' } as MCPContentBlock;
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('converts resource_link with image/* mimeType to ImageURLPart with URL', () => {
    const block = assertValidMcpBlock({
      type: 'resource_link',
      name: 'img.png',
      uri: 'https://example.com/img.png',
      mimeType: 'image/png',
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'image_url',
      imageUrl: { url: 'https://example.com/img.png' },
    });
  });

  test('converts resource_link with audio/* mimeType to AudioURLPart with URL', () => {
    const block = assertValidMcpBlock({
      type: 'resource_link',
      name: 'audio.mp3',
      uri: 'https://example.com/audio.mp3',
      mimeType: 'audio/mpeg',
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'audio_url',
      audioUrl: { url: 'https://example.com/audio.mp3' },
    });
  });

  test('converts resource_link with video/* mimeType to VideoURLPart with URL', () => {
    const block = assertValidMcpBlock({
      type: 'resource_link',
      name: 'video.mp4',
      uri: 'https://example.com/video.mp4',
      mimeType: 'video/mp4',
    });
    expect(convertMCPContentBlock(block)).toEqual({
      type: 'video_url',
      videoUrl: { url: 'https://example.com/video.mp4' },
    });
  });

  test('returns null for resource_link with unsupported mimeType', () => {
    const block = assertValidMcpBlock({
      type: 'resource_link',
      name: 'file.bin',
      uri: 'https://example.com/file.bin',
      mimeType: 'application/octet-stream',
    });
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('returns null for unknown block type', () => {
    const block: MCPContentBlock = { type: 'fancy_new_type', text: 'whatever' };
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('returns null for text block missing text field', () => {
    const block: MCPContentBlock = { type: 'text' };
    expect(convertMCPContentBlock(block)).toBeNull();
  });

  test('returns null for image block missing data field', () => {
    const block: MCPContentBlock = { type: 'image', mimeType: 'image/png' };
    expect(convertMCPContentBlock(block)).toBeNull();
  });
});

describe('mcpResultToExecutableOutput', () => {
  function result(content: MCPContentBlock[], isError = false): MCPToolResult {
    return { content, isError };
  }

  test('collapses a single text part into a plain string', () => {
    const out = mcpResultToExecutableOutput(result([{ type: 'text', text: 'hello' }]), 'mcp__s__t');
    expect(out).toEqual({ output: 'hello', isError: false });
  });

  test('propagates isError=true on the success-shape return', () => {
    const out = mcpResultToExecutableOutput(
      result([{ type: 'text', text: 'oops' }], true),
      'mcp__s__t',
    );
    expect(out).toEqual({ output: 'oops', isError: true });
  });

  test('returns an empty string when the content array is empty', () => {
    const out = mcpResultToExecutableOutput(result([]), 'mcp__s__t');
    // No parts survive; collapseSingleText has nothing to collapse so the
    // ContentPart[] branch wins. An empty array is the model-visible signal
    // that the tool returned no content.
    expect(out).toEqual({ output: [], isError: false });
  });

  test('drops unconvertible blocks and keeps the rest', () => {
    const out = mcpResultToExecutableOutput(
      result([
        { type: 'text', text: 'kept' },
        { type: 'fancy_new_type', text: 'dropped' },
      ]),
      'mcp__s__t',
    );
    expect(out).toEqual({ output: 'kept', isError: false });
  });

  test('wraps media-only output in mcp_tool_result tags using the qualified name', () => {
    const out = mcpResultToExecutableOutput(
      result([{ type: 'image', data: PNG_B64, mimeType: 'image/png' }]),
      'mcp__github__create_pr',
    );
    expect(out.isError).toBe(false);
    expect(out.output).toEqual([
      { type: 'text', text: '<mcp_tool_result name="mcp__github__create_pr">' },
      { type: 'image_url', imageUrl: { url: `data:image/png;base64,${PNG_B64}` } },
      { type: 'text', text: '</mcp_tool_result>' },
    ]);
  });

  test('does NOT wrap when a non-empty text part accompanies the media', () => {
    const out = mcpResultToExecutableOutput(
      result([
        { type: 'text', text: 'caption' },
        { type: 'image', data: PNG_B64, mimeType: 'image/png' },
      ]),
      'mcp__s__t',
    );
    expect(out.output).toEqual([
      { type: 'text', text: 'caption' },
      { type: 'image_url', imageUrl: { url: `data:image/png;base64,${PNG_B64}` } },
    ]);
  });

  test('an empty-text companion still triggers the wrap', () => {
    const out = mcpResultToExecutableOutput(
      result([
        { type: 'text', text: '' },
        { type: 'image', data: PNG_B64, mimeType: 'image/png' },
      ]),
      'mcp__s__t',
    );
    const parts = out.output as ContentPart[];
    expect(parts[0]).toEqual({ type: 'text', text: '<mcp_tool_result name="mcp__s__t">' });
    expect(parts.at(-1)).toEqual({ type: 'text', text: '</mcp_tool_result>' });
  });

  test('truncates oversized text and merges the notice into the surviving text part', () => {
    const out = mcpResultToExecutableOutput(
      result([{ type: 'text', text: 'x'.repeat(100_001) }]),
      'mcp__s__t',
    );
    // The notice merges into the single text part so collapseSingleText still
    // emits a plain string — the very common "single oversized text" case.
    expect(out.output).toBe('x'.repeat(100_000) + MCP_OUTPUT_TRUNCATED_TEXT);
  });

  test('drops oversized binary parts in favor of a per-part notice without touching the text budget', () => {
    // 14 MiB base64 ≈ 10.5 MiB raw — just above the 10 MiB per-part cap.
    const huge = PNG_PREFIX + 'x'.repeat(14 * 1024 * 1024);
    const out = mcpResultToExecutableOutput(
      result([{ type: 'image', data: huge, mimeType: 'image/png' }]),
      'mcp__s__big',
    );
    const parts = out.output as ContentPart[];
    expect(parts).toHaveLength(3);
    expect(parts[0]).toEqual({ type: 'text', text: '<mcp_tool_result name="mcp__s__big">' });
    expect(parts[1]?.type).toBe('text');
    expect((parts[1] as { text: string }).text).toContain('image_url dropped');
    expect((parts[1] as { text: string }).text).toContain('10 MB per-part limit');
    expect(parts[2]).toEqual({ type: 'text', text: '</mcp_tool_result>' });
    // The text-budget marker must NOT appear — only the binary part was dropped.
    const joined = parts.map((p) => (p.type === 'text' ? p.text : '')).join('');
    expect(joined).not.toContain('Output truncated');
  });

  test('binary part within the per-part cap survives intact alongside oversized text', () => {
    const imageB64 = PNG_PREFIX + 'B'.repeat(500_000);
    const out = mcpResultToExecutableOutput(
      result([
        { type: 'text', text: 'A'.repeat(100_000) },
        { type: 'image', data: imageB64, mimeType: 'image/png' },
      ]),
      'mcp__s__t',
    );
    // Text fills the entire budget; image still rides through; no truncation
    // marker (text was exactly 100K, not over).
    expect(out.output).toEqual([
      { type: 'text', text: 'A'.repeat(100_000) },
      { type: 'image_url', imageUrl: { url: `data:image/png;base64,${imageB64}` } },
    ]);
  });
});
