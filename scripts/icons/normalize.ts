import { optimize } from 'svgo';

const ALLOWED_ELEMENTS = new Set([
  'svg',
  'g',
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'title',
  'desc',
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'stop',
]);

const ALLOWED_ATTRS = new Set([
  'xmlns',
  'viewBox',
  'width',
  'height',
  'fill',
  'fill-rule',
  'fill-opacity',
  'clip-rule',
  'clipPathUnits',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-dasharray',
  'd',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'points',
  'transform',
  'offset',
  'stop-color',
  'stop-opacity',
  'id',
  'clip-path',
  'opacity',
  'style',
  'version',
  'role',
  'aria-label',
  'preserveAspectRatio',
  'gradientUnits',
]);

const MAX_BYTES = 64 * 1024;

export class UnsafeSvgError extends Error {}

function assertSafe(source: string): void {
  const lower = source.toLowerCase();
  const banned: [string, RegExp][] = [
    ['script element', /<\s*script/],
    ['foreignObject element', /<\s*foreignobject/],
    ['iframe element', /<\s*iframe/],
    ['image element', /<\s*image/],
    ['inline event handler', /\son[a-z]+\s*=/],
    ['javascript: url', /javascript:/],
    ['html data url', /data:text\/html/],
    ['external reference', /(href|xlink:href|src)\s*=\s*["']?(https?:|\/\/)/],
    ['entity declaration', /<!entity/i],
    ['CDATA section', /<!\[cdata\[/i],
  ];
  for (const [label, re] of banned) {
    if (re.test(lower)) throw new UnsafeSvgError(`rejected: ${label}`);
  }
}

function stripTags(source: string): string {
  return source.replace(/<\/?([a-zA-Z][\w:-]*)([^>]*)>/g, (match, rawTag: string, rawAttrs: string) => {
    const tag = rawTag;
    const closing = match.startsWith('</');
    const selfClosing = /\/\s*>$/.test(match);
    if (!ALLOWED_ELEMENTS.has(tag)) return '';
    if (closing) return `</${tag}>`;
    if (selfClosing) return `<${tag}${filterAttrs(rawAttrs)}/>`;
    return `<${tag}${filterAttrs(rawAttrs)}>`;
  });
}

function filterAttrs(rawAttrs: string): string {
  const kept: string[] = [];
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawAttrs)) !== null) {
    const name = m[1] ?? '';
    const value = m[3] ?? m[4] ?? '';
    if (!ALLOWED_ATTRS.has(name)) continue;
    if (/(https?:|\/\/)/i.test(value)) continue;
    kept.push(`${name}="${value.replace(/"/g, '&quot;')}"`);
  }
  return kept.length > 0 ? ` ${kept.join(' ')}` : '';
}

/** Sanitise + optimise one SVG file. Throws UnsafeSvgError for active content. */
export function normalizeSvg(raw: string): string {
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES)
    throw new UnsafeSvgError('rejected: file larger than 64 KB');
  assertSafe(raw);
  const cleaned = stripTags(raw.replace(/<!--[\s\S]*?-->/g, ''));
  const result = optimize(cleaned, {
    multipass: true,
    plugins: [{ name: 'preset-default' }],
  });
  let out = result.data.trim();
  if (!out.startsWith('<svg')) throw new UnsafeSvgError('rejected: not an svg document');
  // SVGO drops xmlns; an <img> or standalone document needs it to parse.
  if (!/^<svg[^>]*\sxmlns=/.test(out)) {
    out = out.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (Buffer.byteLength(out, 'utf8') > MAX_BYTES)
    throw new UnsafeSvgError('rejected: output larger than 64 KB');
  return out.endsWith('\n') ? out : `${out}\n`;
}

/** True when the SVG draws with more than one colour (i.e. it is a full-colour logo). */
export function isMulticolour(svg: string): boolean {
  const colours = new Set(
    [
      ...svg.matchAll(
        /(?:fill|stroke|stop-color)\s*[:=]\s*["']?(#[0-9a-f]{3,8}|rgb\([^)]*\)|hsl\([^)]*\))/gi,
      ),
    ].map((m) => (m[1] ?? '').toLowerCase()),
  );
  const named = [...svg.matchAll(/(?:fill|stroke)\s*=\s*["']([a-z]+)["']/gi)]
    .map((m) => (m[1] ?? '').toLowerCase())
    .filter((c) => c !== 'none' && c !== 'currentcolor' && c !== 'transparent' && c !== 'white');
  return colours.size > 1 || named.length > 0;
}
