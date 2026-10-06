import { requestJson, responseError } from "./request-json";
import type { Workflow } from "./workflow-api";
import type { AgentProvider, AgentSettings } from "./config-api";
import { memoryAction } from "./memory-api";
import type { SessionSummary } from "./memory-api";

const endpoint = "/api/local-agent";

export interface AgentBootstrap {
  workflow: Workflow;
  settings: AgentSettings;
  systemPrompt: string;
  sessions: SessionSummary[];
  semanticCount: number;
}

export interface ClientHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompactionRecord {
  compactionId: string;
  beforeTokens: number;
  afterTokens: number;
  targetTokens: number;
  availableInputTokens: number;
  targetReached: boolean;
  ms: number;
}

export interface AgentEvent {
  reasonCode?: string;
  compactionId?: string;
  beforeTokens?: number;
  afterTokens?: number;
  targetTokens?: number;
  availableInputTokens?: number;
  targetReached?: boolean;
  completedBatches?: number;
  totalBatches?: number;
  taskKind?: string;
  taskId?: string;
  intent?: "none" | "past_episode" | "fact_with_evidence";
  turnId?: string;
  iteration?: number;
  delta?: string;
  tool?: string;
  toolUseId?: string;
  toolCallId?: string;
  summary?: string;
  args?: unknown;
  output?: unknown;
  arguments?: unknown;
  result?: unknown;
  isError?: boolean;
  ms?: number;
  stopReason?: string;
  error?: string;
  messageCount?: number;
  /** 人工审批事件携带的字段。 */
  approvalId?: string;
  kind?: string;
  command?: string;
  reason?: string;
  detail?: string;
  approved?: boolean;
  boundary?: string;
}

export interface AgentTurnResult {
  reply: string;
  iterations: number;
  stopReason: "completed" | "max_iterations";
  toolCallCount: number;
  failedToolCallCount: number;
  derivedTaskIds: string[];
  model: string;
  provider: AgentProvider;
  ms: number;
  retrievalMs: number;
  modelMs: number;
  toolMs: number;
  contextWindow: number;
  maxTokens: number;
  contextSafetyTokens: number;
  availableInputTokens: number;
  peakEstimatedInputTokens: number | null;
  peakInputTokens: number | null;
}

/** 下一轮起步就会占用的上下文；不含本轮检索注入的记忆，因此是下限。 */
export interface ContextUsage {
  contextWindow: number;
  maxTokens: number;
  contextSafetyTokens: number;
  availableInputTokens: number;
  estimatedInputTokens: number;
}

/** 读取 Agent Harness 拓扑和经过脱敏的本地配置。 */
export function loadAgent(): Promise<AgentBootstrap> {
  return requestJson(endpoint);
}

/** 读取某个 Session 的上下文水位；与 Loop 的硬限制同口径。 */
export function loadContextUsage(sessionId: string): Promise<ContextUsage> {
  return memoryAction<ContextUsage>({ action: "context_usage", sessionId });
}

/** 一次等待人工确认的命令请求。 */
export interface PendingApproval {
  id: string;
  kind: string;
  command: string;
  reason: string;
  detail?: string;
}

/** 兑现一次命令确认；请求已失效时服务端返回 ok: false。 */
export async function settleApproval(approvalId: string, approved: boolean): Promise<boolean> {
  const result = await requestJson<{ ok: boolean }>(`${endpoint}/approval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ approvalId, approved }),
  });
  return result.ok;
}

/** 执行一次 Agent 回合并消费服务端 NDJSON observer 事件。 */
export async function runAgent(
  prompt: string,
  sessionId: string,
  onEvent: (kind: string, event: AgentEvent) => void,
  signal: AbortSignal,
): Promise<AgentTurnResult> {
  const response = await fetch(`${endpoint}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, sessionId }),
    signal,
  });
  if (!response.ok || !response.body) throw await responseError(response);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AgentTurnResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const message = JSON.parse(line) as {
      type: "event" | "result" | "error";
      kind?: string;
      event?: AgentEvent;
      result?: AgentTurnResult;
      error?: string;
    };
    if (message.type === "event" && message.kind && message.event) onEvent(message.kind, message.event);
    if (message.type === "result" && message.result) result = message.result;
    if (message.type === "error") throw new Error(message.error || "Agent 执行失败");
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consumeLine(line);
    if (done) break;
  }
  consumeLine(buffer);
  if (!result) throw new Error("本地 Agent 未返回执行结果");
  return result;
}

/** 独立订阅后台记忆事件，聊天完成后仍保持连接。 */
export function subscribeBackgroundEvents(onEvent: (kind: string, event: AgentEvent) => void): () => void {
  const source = new EventSource(`${endpoint}/background-events`);
  source.onmessage = (message) => {
    const { kind, event } = JSON.parse(message.data) as { kind: string; event: AgentEvent };
    onEvent(kind, event);
  };
  return () => source.close();
}
