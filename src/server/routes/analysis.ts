import type { FastifyInstance } from 'fastify';
import { analyze, costSummary, findingCounts, wanExposure } from '#shared/analysis/index.ts';
import type { Db } from '../db/client.ts';
import { getProject } from '../db/repo/projects.ts';

export async function registerAnalysis(app: FastifyInstance, db: Db): Promise<void> {
  app.get('/api/projects/:id/analysis', async (req) => {
    const { id } = req.params as { id: string };
    const project = getProject(db, id);
    const result = analyze(project.document);
    return {
      ...result,
      counts: findingCounts(result),
      exposure: wanExposure(project.document),
      cost: costSummary(project.document),
    };
  });
}
