import { requestJson } from "./request-json";

const endpoint = "/api/local-agent";

export type AgentProvider = "anthropic" | "openai-compatible" | "gemini";

export type EmbeddingProvider = "openai-compatible" | "gemini";

export type RetrievalMode = "lexical_only" | "dense_only" | "hybrid";

export interface ModelConnectionSettings {
  provider: AgentProvider;
  model: string;
  baseUrl: string;
  keyConfigured: boolean;
  keyLast4: string;
}

export interface AgentSettings {
  agentModel: ModelConnectionSettings;
  smallModel: ModelConnectionSettings;
  sessionSearchWindow: number;
  sessionRecallEntryTokenLimit: number;
  /** 由 Model Context Window 派生的只读总额。 */
  sessionRecallTokenLimit: number;
  modelContextWindow: number;
  maxTokens: number;
  maxIterations: number;
  retrievalMode: RetrievalMode;
  embeddingProvider: EmbeddingProvider;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingQueryTemplate: string;
  embeddingDocumentTemplate: string;
  embeddingMinimumSimilarity: number;
  embeddingKeyConfigured: boolean;
  embeddingKeyLast4: string;
  embeddingIndex: { ready: boolean; generationId: string | null; profileHash: string | null };
  /** 终端命令的执行边界；`unavailableReason` 非空时当前平台无法建立沙箱。 */
  sandbox: { workspaceRoot: string; kind: string | null; unavailableReason: string | null };
  limits: Record<string, { min: number; max: number }>;
}

/** 保存模型配置；服务端在必要时先测试连接。 */
export function saveAgentConfig(value: {
  agentModel: ModelConnectionSettingsInput;
  smallModel: ModelConnectionSettingsInput;
  sessionSearchWindow: number;
  sessionRecallEntryTokenLimit: number;
  modelContextWindow: number;
  maxTokens: number;
  maxIterations: number;
  retrievalMode: RetrievalMode;
  embeddingProvider: EmbeddingProvider;
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingQueryTemplate: string;
  embeddingDocumentTemplate: string;
  embeddingMinimumSimilarity: number;
  embeddingApiKey: string;
  sandboxWorkspaceRoot: string;
  clearEmbeddingApiKey: boolean;
  force?: boolean;
}): Promise<{ ok: true; settings: AgentSettings; models: Record<"agentModel" | "smallModel", string[]> }> {
  return requestJson(`${endpoint}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

/** 恢复非模型运行参数默认值。 */
export function resetRuntimeConfig(): Promise<{ ok: true; settings: AgentSettings }> {
  return requestJson(`${endpoint}/config/reset-runtime`, { method: "POST" });
}

/** 建立完整影子向量索引，并在全部成功后原子激活。 */
export function rebuildEmbeddingIndex(): Promise<{ ok: true; settings: AgentSettings; result: { rebuildId: string; generationId: string; chunkCount: number } }> {
  return requestJson(`${endpoint}/config/rebuild-embeddings`, { method: "POST" });
}

export function cancelEmbeddingIndexRebuild(): Promise<{ ok: true; cancelled: boolean }> {
  return requestJson(`${endpoint}/config/cancel-embedding-rebuild`, { method: "POST" });
}

export interface ModelConnectionSettingsInput {
  provider: AgentProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
  clearApiKey: boolean;
}

/** 立即清除指定用途模型连接的本地 API Key。 */
export function clearModelApiKey(target: "agentModel" | "smallModel"): Promise<{ ok: true; settings: AgentSettings }> {
  return requestJson(`${endpoint}/config/clear-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
}

export function clearEmbeddingApiKey(): Promise<{ ok: true; settings: AgentSettings }> {
  return requestJson(`${endpoint}/config/clear-embedding-api-key`, { method: "POST" });
}

/** 显式更新 `.everything/EVERYTHING.md`。 */
export function saveSystemPrompt(systemPrompt: string): Promise<{ ok: true; systemPrompt: string }> {
  return requestJson(`${endpoint}/system-prompt`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ systemPrompt }),
  });
}
