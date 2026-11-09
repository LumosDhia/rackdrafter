import Fastify from 'fastify';
import { registerProjects } from './routes/projects.ts';

const app = Fastify({ logger: true });
await registerProjects(app);
await app.listen({ port: 4747, host: '127.0.0.1' });
