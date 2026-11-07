import { device } from '../../define.ts';

export const power = [
  device({
    slug: 'ups',
    name: 'UPS',
    cat: 'power',
    desc: 'Battery backup, 900 W and 400 Wh.',
    url: 'https://networkupstools.org',
    glyph: 'battery-charging',
    tags: ['battery', 'apc', 'eaton', 'nut', 'backup power'],
    role: 'ups',
    ff: 'appliance',
    nics: [],
    power: [6, 6],
    ups: [900, 400],
    price: 160,
  }),
  device({
    slug: 'smart-plug',
    name: 'Smart plug',
    cat: 'power',
    desc: 'Metered Wi-Fi or Zigbee outlet.',
    url: 'https://www.home-assistant.io/integrations/switch/',
    glyph: 'plug',
    tags: ['tasmota', 'shelly', 'zigbee', 'meter', 'outlet'],
    role: 'smart-plug',
    ff: 'wall-plug',
    nics: [{ name: 'wlan0', kind: 'wifi', speed: 72 }],
    power: [1, 1],
    price: 15,
  }),
];
