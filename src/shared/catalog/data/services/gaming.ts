import { service } from '../../define.ts';

export const gaming = [
  service({
    slug: 'crafty-controller',
    name: 'Crafty Controller',
    cat: 'gaming',
    desc: 'Web panel for Minecraft servers.',
    url: 'https://craftycontrol.com',
    image: 'registry.gitlab.com/crafty-controller/crafty-4:4.4.7',
    tags: ['minecraft', 'panel', 'game servers'],
    cpu: 1000,
    ram: 2048,
    ports: [
      ['panel', 8443, 8443, 'tcp', 'https'],
      ['minecraft', 25565, null, 'tcp', 'minecraft'],
    ],
    vols: [
      ['servers', '/crafty/servers', 'data', 20],
      ['config', '/crafty/app/config', 'config', 1],
      ['backups', '/crafty/backups', 'data', 20],
    ],
    admin: true,
    icon: { aliases: { 'dashboard-icons': 'crafty-controller', selfhst: 'crafty-controller' } },
  }),
  service({
    slug: 'minecraft-server',
    name: 'Minecraft server',
    cat: 'gaming',
    desc: 'Java Edition server with automatic updates.',
    url: 'https://github.com/itzg/docker-minecraft-server',
    image: 'itzg/minecraft-server:2024.12.1-java21',
    tags: ['minecraft', 'java', 'paper', 'game server'],
    cpu: 2000,
    ram: 4096,
    ports: [['minecraft', 25565, 25565, 'tcp', 'minecraft']],
    vols: [['data', '/data', 'data', 10]],
    env: [['EULA', 'TRUE']],
    icon: { aliases: { 'dashboard-icons': 'minecraft', selfhst: 'minecraft', 'simple-icons': 'minecraft' } },
  }),
];
