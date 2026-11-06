export function slugify(s: string): string {
  const nfkd = s.normalize('NFKD');
  let stripped = '';
  for (const ch of nfkd) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue;
    stripped += ch;
  }
  let out = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .slice(0, 63)
    .replace(/-+$/, '');
  if (out === '') out = 'x';
  if (/^[0-9]/.test(out)) out = `s-${out}`;
  return out;
}

export function uniqueSlugs<T>(
  items: readonly T[],
  keyFn: (item: T) => { slug: string; label: string; id: string },
): Map<string, string> {
  const decorated = items.map((item, index) => {
    const k = keyFn(item);
    return { item, index, slug: slugify(k.slug), label: k.label, id: k.id };
  });
  decorated.sort((a, b) => {
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    if (a.label < b.label) return -1;
    if (a.label > b.label) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return a.index - b.index;
  });
  const used = new Map<string, number>();
  const result = new Map<string, string>();
  for (const d of decorated) {
    const count = used.get(d.slug) ?? 0;
    used.set(d.slug, count + 1);
    const assigned = count === 0 ? d.slug : `${d.slug}-${count + 1}`;
    result.set(d.id, assigned);
  }
  return result;
}
