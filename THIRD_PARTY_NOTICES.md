# Third-party notices

This project bundles third-party icons and fonts. Product names, logos and brands are the property of their
respective owners and are used for identification purposes only. Their use does not imply endorsement by, or
affiliation with, the trademark holder. Where an upstream logo is subject to a brand guideline that forbids
redistribution, the file is fetched locally by the operator's build and remains subject to that guideline.

## Icon sources

- **dashboard-icons** — Apache-2.0 — https://github.com/homarr-labs/dashboard-icons (resolved commit `d767d7327db7f8ebd3715b552523f61889eea41c`)
- **selfhst** — CC-BY-4.0 — https://github.com/selfhst/icons (resolved commit `2102cc3ccf73394541eab751c1bc8f35deb79e06`)
- **simple-icons** — CC0-1.0 — https://github.com/simple-icons/simple-icons

Files: 99 brand logos, 46 entries rendered with
interface glyphs instead.

- dashboard-icons: 91 files
- selfhst: 7 files
- simple-icons: 1 files

## Glyphs

- **tabler** — MIT — https://github.com/tabler/tabler-icons
  Interface and device glyphs from Tabler Icons (MIT, (c) Pawel Kuna).

Icons are fetched by `npm run icons:fetch` from the pinned sources above, sanitised (scripts, event handlers,
external references and foreignObject content are removed), optimised with SVGO, and committed under
`public/icons/`. The SHA-256 of every file is recorded in `icons.lock.json` and checked offline by
`npm run icons:verify`.

## Fonts

- **IBM Plex Sans** and **IBM Plex Mono** — SIL Open Font License 1.1 — https://github.com/IBM/plex
  Bundled through `@fontsource` packages, subset to Latin.

## Libraries

Runtime dependencies and their licences are listed by `npm ls --all`; the direct dependencies are all
permissively licensed (MIT, ISC, Apache-2.0, CC0-1.0, SIL OFL-1.1).
