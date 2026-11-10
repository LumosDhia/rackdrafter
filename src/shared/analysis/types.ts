import type { NodeId, RuleId } from '../domain/types.ts';

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  id: string;
  ruleId: RuleId;
  severity: Severity;
  title: string;
  message: string;
  subjects: NodeId[];
  data?: unknown;
}

export interface AnalysisResult {
  findings: Finding[];
}

export interface GeneratedFile {
  path: string;
  content: string;
  mime: string;
}

export function emptyAnalysis(): AnalysisResult {
  return { findings: [] };
}
