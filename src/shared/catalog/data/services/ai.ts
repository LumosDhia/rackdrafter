import { service } from '../../define.ts';

export const ai = [
  service({
    slug: 'ollama',
    name: 'Ollama',
    cat: 'ai',
    desc: 'Runs open large language models locally.',
    url: 'https://ollama.com',
    image: 'ollama/ollama:0.5.4',
    tags: ['llm', 'ai', 'models', 'llama', 'inference'],
    cpu: 2000,
    ram: 8192,
    gpu: 'optional',
    gpuApis: ['cuda', 'amf'],
    ports: [['http', 11434, 11434, 'tcp', 'http']],
    vols: [['models', '/root/.ollama', 'data', 50]],
  }),
  service({
    slug: 'open-webui',
    name: 'Open WebUI',
    cat: 'ai',
    desc: 'Chat front end for Ollama and OpenAI-style APIs.',
    url: 'https://openwebui.com',
    image: 'ghcr.io/open-webui/open-webui:0.5.4',
    tags: ['llm', 'chat', 'ui', 'ollama'],
    cpu: 250,
    ram: 1024,
    ports: [['http', 8080, 3080, 'tcp', 'http']],
    vols: [['data', '/app/backend/data', 'data', 5]],
    admin: true,
  }),
];
