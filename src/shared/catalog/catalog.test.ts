import { describe, expect, it } from 'vitest';
import {
  CATALOG,
  DEVICES,
  SERVICES,
  catalogBySlug,
  catalogGlyphs,
  catalogIconRefs,
  getCatalogItem,
  groupedCatalog,
  matchByImage,
  searchCatalog,
} from './index.ts';
import { CATEGORY_GLYPH } from './define.ts';
import { categoryHue, categoryLabel } from './visuals.ts';
import { ICON_MANIFEST } from '../../client/ui/icon-manifest.generated.ts';
import { TABLER_GLYPHS } from '../../client/ui/glyphs.generated.ts';

describe('catalog', () => {
  it('ships 145 entries: 47 devices and 98 services', () => {
    expect(CATALOG.length).toBe(145);
    expect(DEVICES.length).toBe(47);
    expect(SERVICES.length).toBe(98);
  });

  it('has unique slugs and names', () => {
    expect(new Set(CATALOG.map((i) => i.slug)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((i) => i.name)).size).toBe(CATALOG.length);
  });

  it('uses kebab-case slugs', () => {
    for (const item of CATALOG) expect(item.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('groups devices before services and keeps category order stable', () => {
    const groups = groupedCatalog();
    expect(groups[0]?.kind).toBe('device');
    expect(groups.at(-1)?.kind).toBe('service');
    const kinds = groups.map((g) => g.kind);
    expect(kinds.indexOf('service')).toBe(kinds.lastIndexOf('device') + 1);
  });

  it('resolves every catalog item by slug', () => {
    for (const item of CATALOG) expect(getCatalogItem(item.slug)).toBe(item);
    expect(catalogBySlug.size).toBe(145);
  });

  it('gives every item a category colour and label', () => {
    for (const item of CATALOG) {
      expect(categoryHue(item)).toBeGreaterThanOrEqual(0);
      expect(categoryLabel(item)).not.toBe('');
    }
  });

  it('declares valid service ports', () => {
    for (const service of SERVICES) {
      for (const port of service.defaults.ports) {
        expect(port.containerPort).toBeGreaterThan(0);
        expect(port.containerPort).toBeLessThan(65536);
        expect(['tcp', 'udp']).toContain(port.proto);
        if (port.hostPort !== null) {
          expect(port.hostPort).toBeGreaterThan(0);
          expect(port.hostPort).toBeLessThan(65536);
        }
      }
    }
  });

  it('declares positive resource requests for everything that runs a container', () => {
    for (const service of SERVICES) {
      // Externally managed entries (control-plane UIs, "bring your own") may
      // declare zero because this tool does not schedule them.
      // Host-level units (a hypervisor's own web UI) and off-site services are
      // not scheduled by this tool, so a zero request is honest.
      if (service.defaults.runtime === 'external' || service.defaults.runtime === 'systemd') {
        expect(Number.isInteger(service.defaults.resources.cpuMillicores)).toBe(true);
        continue;
      }
      expect(service.defaults.resources.cpuMillicores, service.slug).toBeGreaterThan(0);
      expect(service.defaults.resources.ramMb, service.slug).toBeGreaterThan(0);
    }
  });

  it('every device declares a role and a form factor', () => {
    for (const device of DEVICES) {
      expect(device.defaults.role, device.slug).toBeTruthy();
      expect(device.defaults.formFactor, device.slug).toBeTruthy();
    }
  });

  it('only network-less accessories (disks, UPS, radios) have no NIC', () => {
    for (const device of DEVICES) {
      if (device.defaults.nics.length === 0) {
        expect(['storage', 'power', 'clients'], device.slug).toContain(device.category);
      } else {
        expect(device.defaults.nics[0]?.primary).toBe(true);
        expect(device.defaults.nics.filter((n) => n.primary).length).toBe(1);
      }
    }
  });

  it('has an official https url for every item', () => {
    for (const item of CATALOG) expect(item.officialUrl).toMatch(/^https:\/\//);
  });

  it('maps every service category to a bundled glyph', () => {
    for (const service of SERVICES) {
      if (service.icon.prefer === 'glyph') {
        expect(TABLER_GLYPHS[service.icon.glyph], `${service.slug} glyph`).toBeDefined();
      }
      expect(TABLER_GLYPHS[CATEGORY_GLYPH[service.category]]).toBeDefined();
    }
  });

  it('resolves every catalog glyph to a generated Tabler path set', () => {
    const glyphs = catalogGlyphs();
    expect(glyphs.length).toBeGreaterThan(20);
    for (const glyph of glyphs) expect(TABLER_GLYPHS[glyph], glyph).toBeDefined();
  });

  it('has a brand file or a glyph for every entry', () => {
    for (const ref of catalogIconRefs()) {
      const brand = ICON_MANIFEST.entries[ref.slug];
      const glyph = TABLER_GLYPHS[ref.glyph];
      expect(Boolean(brand) || Boolean(glyph), ref.slug).toBe(true);
    }
  });

  it('only records brand files for known catalogs, with a licence and hash', () => {
    for (const [slug, entry] of Object.entries(ICON_MANIFEST.entries)) {
      expect(catalogBySlug.has(slug), slug).toBe(true);
      expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.license).not.toBe('');
      expect(entry.file.startsWith('icons/')).toBe(true);
    }
  });

  it('reports 99 bundled logos and 46 glyph-only entries', () => {
    expect(Object.keys(ICON_MANIFEST.entries).length).toBe(99);
    expect(ICON_MANIFEST.missing.length).toBe(46);
  });

  it('searches by name, tag and description', () => {
    expect(searchCatalog('jelly').map((i) => i.slug)).toContain('jellyfin');
    expect(searchCatalog('postgres').map((i) => i.slug)).toContain('postgres');
    expect(searchCatalog('tls').length).toBeGreaterThan(0);
    expect(searchCatalog('zzzzz')).toEqual([]);
  });

  it('requires every search term to match', () => {
    expect(searchCatalog('media server').map((i) => i.slug)).toContain('jellyfin');
    expect(searchCatalog('jellyfin postgres')).toEqual([]);
  });

  it('maps known container images back to catalog items', () => {
    expect(matchByImage('jellyfin/jellyfin:10.10.3')?.slug).toBe('jellyfin');
    expect(matchByImage('linuxserver/jellyfin:latest')?.slug).toBe('jellyfin');
    expect(matchByImage('ghcr.io/immich-app/immich-server:v1')?.slug).toBe('immich');
    expect(matchByImage('example/unknown:1')).toBeUndefined();
  });
});
