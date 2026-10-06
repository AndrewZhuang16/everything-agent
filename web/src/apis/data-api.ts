import { requestJson } from "./request-json";
import { rebuildEmbeddingIndex } from "./config-api";

const endpoint = "/api/local-agent";

/** 清除所有本地 Agent 运行数据；已配置 Embedding 时随后建立新的空索引。 */
export async function clearAllAgentData(rebuildEmbeddings = false): Promise<{
  ok: true;
  cleared: true;
  embeddingRebuild: Awaited<ReturnType<typeof rebuildEmbeddingIndex>> | null;
}> {
  const cleared = await requestJson<{ ok: true; cleared: true }>(`${endpoint}/clear-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation: "DELETE_ALL_LOCAL_DATA" }),
  });
  let embeddingRebuild: Awaited<ReturnType<typeof rebuildEmbeddingIndex>> | null = null;
  if (rebuildEmbeddings) {
    try {
      embeddingRebuild = await rebuildEmbeddingIndex();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`本地数据已清理，但自动重建向量索引失败：${message}`, { cause: error });
    }
  }
  return { ...cleared, embeddingRebuild };
}
