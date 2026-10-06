import { requestJson } from "./request-json";
import type { EvaluationRun } from '../../../src/evaluation/types';
export interface EvaluationDashboard {
  configured: boolean; error: string; baseUrl: string; projectId: string; webhookUrl: string; runs: EvaluationRun[];
  approvals: { id: string; runId: string; itemId: string; command: string; reason: string; detail?: string }[];
}
/** 读取本地评估快照；网络失败保留给界面展示。 */
export async function evaluationRequest<T>(path = '', body?: unknown): Promise<T> {
  return requestJson(`/api/evaluation${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
