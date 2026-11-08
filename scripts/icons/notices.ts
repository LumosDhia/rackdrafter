import type { IconManifest } from '../../src/shared/catalog/iconManifest.ts';
export function buildNotices(manifest: IconManifest): string {
  const packLines = Object.entries(manifest.packs)
    .map(
      ([pack, info]) =>
        `- **${pack}** — ${info.license} — ${info.homepage}${
          info.resolvedCommit ? ` (resolved commit \`${info.resolvedCommit}\`)` : ''
        }`,
    )
    .sort()
    .join('\n');

  const perPackCounts = new Map<string, number>();
  for (const entry of Object.values(manifest.entries)) {
    perPackCounts.set(entry.pack, (perPackCounts.get(entry.pack) ?? 0) + 1);
  }
  const countLines = [...perPackCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pack, n]) => `- ${pack}: ${n} files`)
    .join('\n');

  return `# Third-party notices

This project bundles third-party icons and fonts. Product names, logos and brands are the property of their
respective owners and are used for identification purposes only. Their use does not imply endorsement by, or
affiliation with, the trademark holder. Where an upstream logo is subject to a brand guideline that forbids
redistribution, the file is fetched locally by the operator's build and remains subject to that guideline.

## Icon sources

${packLines}

Files: ${Object.keys(manifest.entries).length} brand logos, ${manifest.missing.length} entries rendered with
interface glyphs instead.

${countLines}

## Glyphs

- **${manifest.glyphPack.name}** — ${manifest.glyphPack.license} — ${manifest.glyphPack.homepage}
  ${manifest.glyphPack.attribution}

Icons are fetched by \`npm run icons:fetch\` from the pinned sources above, sanitised (scripts, event handlers,
external references and foreignObject content are removed), optimised with SVGO, and committed under
\`public/icons/\`. The SHA-256 of every file is recorded in \`icons.lock.json\` and checked offline by
\`npm run icons:verify\`.

## Fonts

- **IBM Plex Sans** and **IBM Plex Mono** — SIL Open Font License 1.1 — https://github.com/IBM/plex
  Bundled through \`@fontsource\` packages, subset to Latin.

## Libraries

Runtime dependencies and their licences are listed by \`npm ls --all\`; the direct dependencies are all
permissively licensed (MIT, ISC, Apache-2.0, CC0-1.0, SIL OFL-1.1).
`;
}
