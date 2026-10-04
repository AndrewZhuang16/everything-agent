import type { createLocalConfig } from "../agent-runtime/local-config.ts";
import type { ToolExecutionContext } from "../agent-loop/agent-loop.ts";

export const MANAGE_EVERYTHING_TOOL = "manage_everything";
export const manageEverythingSchema = {
  name: MANAGE_EVERYTHING_TOOL,
  description: "查看或修改用户常驻规则 EVERYTHING.md。read 返回全文；write 用 content 整体替换，请先读取并保留无关规则，仅在用户要求调整常驻规则时修改。保存后从下一轮对话生效。",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["read", "write"] },
      content: { type: "string", description: "write 必填：完整规则正文，非空且最多 100000 字符。" },
    },
    required: ["action"],
    additionalProperties: false,
  },
} as const;

/** 只操作运行时常驻规则，复用配置页的原子持久化，不接受文件路径。 */
export class ManageEverythingTool {
  private readonly config: Pick<ReturnType<typeof createLocalConfig>, "readSystemPrompt" | "saveSystemPrompt">;

  constructor(config: Pick<ReturnType<typeof createLocalConfig>, "readSystemPrompt" | "saveSystemPrompt">) {
    this.config = config;
  }

  /** 校验操作和正文；取消或超时后禁止开始读写，持久化错误直接交给调用方。 */
  async execute(args: unknown, context: ToolExecutionContext): Promise<unknown> {
    if (context.signal?.aborted) throw context.signal.reason;
    if (context.deadline !== null && Date.now() >= context.deadline) throw new Error("常驻规则操作已超时");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new TypeError("manage_everything 参数必须是对象");
    const input = args as Record<string, unknown>;
    if (Object.keys(input).some(key => key !== "action" && key !== "content")) throw new TypeError("manage_everything 不接受未知参数");
    if (input.action === "read") {
      if (Object.hasOwn(input, "content")) throw new TypeError("read 不接受 content");
      const content = await this.config.readSystemPrompt();
      return { action: "read", content, contentLength: content.length };
    }
    if (input.action !== "write") throw new TypeError("action 必须是 read 或 write");
    if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 100_000) throw new TypeError("content 必须是非空且最多 100000 字符的字符串");
    await this.config.saveSystemPrompt(input.content);
    return { action: "write", status: "saved", contentLength: `${input.content.trimEnd()}\n`.length, effectiveFrom: "next_turn" };
  }
}
