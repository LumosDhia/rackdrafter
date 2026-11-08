import type { CatalogItem } from '#shared/catalog/types.ts';
import { categoryTint } from '#shared/catalog/visuals.ts';
import { Glyph } from './Glyph.tsx';
import { brandIcon, brandIconLightUrl, brandIconUrl } from './icons.ts';

export type IconTileSize = 48 | 40 | 32 | 28 | 24 | 20;

const RADIUS: Record<IconTileSize, number> = { 48: 10, 40: 9, 32: 8, 28: 7, 24: 6, 20: 5 };
const GLYPH: Record<IconTileSize, number> = { 48: 26, 40: 22, 32: 18, 28: 16, 24: 14, 20: 12 };
const PAD: Record<IconTileSize, number> = { 48: 9, 40: 8, 32: 6, 28: 5, 24: 4, 20: 3 };

/**
 * One tile treatment for both icon families, so filled brand logos and outline
 * glyphs read as a single set: fixed box, 1px inner border, consistent padding.
 *
 * - Colour logos sit on a white tile (they are designed for light surfaces).
 * - When the pack ships a `-light` variant it is swapped in under `.dark`.
 * - Monochrome brand marks are inverted in dark mode.
 * - Glyphs are drawn in the foreground colour on a 12% category tint.
 */
export function IconTile({
  item,
  size = 40,
  className = '',
}: {
  item: Pick<CatalogItem, 'slug' | 'category' | 'icon'>;
  size?: IconTileSize;
  className?: string;
}) {
  const entry = brandIcon(item.slug);
  const light = entry ? brandIconLightUrl(entry) : null;
  const radius = RADIUS[size];
  const inner = size - PAD[size] * 2;

  if (!entry) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center border border-[hsl(var(--border))] text-[hsl(var(--fg))] ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: categoryTint(item),
        }}
        aria-hidden="true"
      >
        <Glyph name={item.icon.glyph} size={GLYPH[size]} />
      </span>
    );
  }

  const src = brandIconUrl(entry);
  const tileBg = entry.multicolour ? 'hsl(var(--icon-tile))' : 'hsl(var(--surface-2))';

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[hsl(var(--border))] ${className}`}
      style={{ width: size, height: size, borderRadius: radius, background: tileBg }}
      aria-hidden="true"
    >
      {light ? (
        <>
          <img
            src={src}
            alt=""
            width={inner}
            height={inner}
            loading="lazy"
            decoding="async"
            className="block dark:hidden"
            style={{ objectFit: 'contain' }}
          />
          <img
            src={light}
            alt=""
            width={inner}
            height={inner}
            loading="lazy"
            decoding="async"
            className="hidden dark:block"
            style={{ objectFit: 'contain' }}
          />
        </>
      ) : (
        <img
          src={src}
          alt=""
          width={inner}
          height={inner}
          loading="lazy"
          decoding="async"
          className={entry.multicolour ? 'block' : 'block dark:invert'}
          style={{ objectFit: 'contain' }}
        />
      )}
    </span>
  );
}
