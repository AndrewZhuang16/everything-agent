import { requestJson } from "./request-json";

const endpoint = "/api/local-agent";

export interface AgentTool {
  name: string;
  description: string;
  origin: "内置" | "Tavily" | "Apple Calendar";
  enabled: boolean;
  configurable: boolean;
  configured: boolean;
  configurationLabel?: string;
}

export interface ToolsCatalog {
  tools: AgentTool[];
  tavily: { keyConfigured: boolean; keyLast4: string };
  /** 终端工具的沙箱状态；`unavailableReason` 非空时该工具不会注册。 */
  terminal: { sandboxKind: string | null; unavailableReason: string | null; workspaceRoot: string };
}

/** 读取 Agent 当前工具目录；外部凭证只返回状态和末四位。 */
export function loadTools(): Promise<ToolsCatalog> {
  return requestJson(`${endpoint}/tools`);
}

/** 保存工具开关和 Tavily 配置，下一回合立即生效。 */
export function saveTools(value: {
  getCurrentTimeEnabled: boolean;
  searchWebEnabled: boolean;
  tavilyApiKey: string;
  clearTavilyApiKey: boolean;
  terminalEnabled?: boolean | undefined;
  appleCalendarEnabled?: boolean | undefined;
}): Promise<{ ok: true } & ToolsCatalog> {
  return requestJson(`${endpoint}/tools`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}
