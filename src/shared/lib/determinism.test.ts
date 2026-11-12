import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { slugify, uniqueSlugs } from './determinism.ts';

describe('determinism', () => {
  it('slugify("Nginx Proxy Manager") === "nginx-proxy-manager"', () => {
    expect(slugify('Nginx Proxy Manager')).toBe('nginx-proxy-manager');
  });

  it('slugify("Café Ünïcode") === "cafe-unicode"', () => {
    expect(slugify('Café Ünïcode')).toBe('cafe-unicode');
  });

  it('slugify("123abc") === "s-123abc"', () => {
    expect(slugify('123abc')).toBe('s-123abc');
  });

  it('property: slugify is idempotent', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = slugify(s);
        expect(slugify(once)).toBe(once);
      }),
    );
  });

  it('uniqueSlugs assigns -2 in sorted order', () => {
    const items = [
      { slug: 'web', label: 'zeta', id: 'b' },
      { slug: 'web', label: 'alpha', id: 'a' },
      { slug: 'db', label: 'db', id: 'c' },
    ];
    const map = uniqueSlugs(items, (x) => x);
    expect(map.get('c')).toBe('db');
    expect(map.get('a')).toBe('web');
    expect(map.get('b')).toBe('web-2');
  });
});
