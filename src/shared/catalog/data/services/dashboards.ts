import { service } from '../../define.ts';

export const dashboards = [
  service({
    slug: 'homarr',
    name: 'Homarr',
    cat: 'dashboards',
    desc: 'Customisable start page with service integrations.',
    url: 'https://homarr.dev',
    image: 'ghcr.io/ajnart/homarr:0.15.10',
    tags: ['dashboard', 'start page', 'homepage'],
    cpu: 100,
    ram: 256,
    ports: [['http', 7575, 7575, 'tcp', 'http']],
    vols: [
      ['configs', '/app/data/configs', 'config', 1],
      ['icons', '/app/public/icons', 'config', 1],
      ['data', '/data', 'data', 1],
    ],
    admin: true,
  }),
  service({
    slug: 'homepage',
    name: 'Homepage',
    cat: 'dashboards',
    desc: 'YAML-configured dashboard with service widgets.',
    url: 'https://gethomepage.dev',
    image: 'ghcr.io/gethomepage/homepage:v0.10.9',
    tags: ['dashboard', 'start page', 'yaml', 'widgets'],
    cpu: 100,
    ram: 128,
    ports: [['http', 3000, 3001, 'tcp', 'http']],
    vols: [['config', '/app/config', 'config', 1]],
    admin: true,
  }),
];
