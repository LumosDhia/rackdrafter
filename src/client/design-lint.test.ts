import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const CLIENT = join(ROOT, 'src/client');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(tsx?|css)$/.test(name) ? [full] : [];
  });
}

const files = walk(CLIENT).map((file) => ({
  file,
  rel: relative(ROOT, file),
  text: readFileSync(file, 'utf8'),
}));

const EMOJI = /\p{Extended_Pictographic}/u;
const HEX_COLOUR = /#[0-9a-fA-F]{3,8}\b/;

const HEX_ALLOWED = new Set([
  'src/client/styles/tokens.css',
  'src/client/ui/icon-manifest.generated.ts',
  'src/client/canvas/Canvas.tsx',
  'src/client/ui/glyphs.generated.ts',
  'src/client/ui/glyphs.ts',
]);

describe('design lint', () => {
  it('uses no emoji in the client source', () => {
    const offenders = files.filter((f) => EMOJI.test(f.text)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('keeps hex colours out of components (tokens or generated data only)', () => {
    const offenders = files
      .filter((f) => !HEX_ALLOWED.has(f.rel))
      .filter((f) => HEX_COLOUR.test(f.text.replace(/\/\*[\s\S]*?\*\//g, '')))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('never hotlinks icons, fonts or images at runtime', () => {
    const offenders = files
      .filter((f) => !f.rel.endsWith('.test.ts'))
      .filter((f) => /(src|href)\s*=\s*\{?\s*['"`]https?:\/\//.test(f.text))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('uses the spacing and radius tokens instead of ad-hoc pixel radii on cards', () => {
    const shell = files.find((f) => f.rel.endsWith('nodes/NodeShell.tsx'));
    expect(shell).toBeDefined();
    expect(shell?.text).toContain('rounded-[8px]');
    expect(shell?.text).not.toMatch(/rounded-(2xl|3xl|full)["' ]/);
  });

  it('defines every colour used by components as a CSS variable', () => {
    const tokens = files.find((f) => f.rel === 'src/client/styles/tokens.css');
    expect(tokens).toBeDefined();
    const used = new Set(
      [...files.map((f) => f.text).join('\n')].length > 0
        ? [
            ...files
              .map((f) => f.text)
              .join('\n')
              .matchAll(/var\(--([a-z0-9-]+)\)/g),
          ].map((m) => m[1])
        : [],
    );
    const declared = new Set([...(tokens?.text ?? '').matchAll(/^\s*--([a-z0-9-]+):/gm)].map((m) => m[1]));
    const missing = [...used].filter((name) => name !== undefined && !declared.has(name));
    expect(missing).toEqual([]);
  });
});
