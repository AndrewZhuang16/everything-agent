import type { AgentObserver, ToolCallRecord, ToolExecutionContext } from "../agent-loop/agent-loop.ts";
import type { LocalTool, ToolCollection, ToolSchema } from "./types.ts";
import { publicToolEvent } from "./tool-events.ts";

/** 注册注入的工具；重名立即报错，不承担具体工具的构造与配置。 */
export class LocalToolRegistry implements ToolCollection {
  private readonly tools = new Map<string, LocalTool>();

  constructor(tools: readonly LocalTool[] = []) {
    for (const tool of tools) {
      if (this.tools.has(tool.schema.name)) throw new Error(`工具重名：${tool.schema.name}`);
      this.tools.set(tool.schema.name, tool);
    }
  }

  /** 按注册顺序返回模型可用的工具 schema，调用方修改不影响注册信息。 */
  schemas(): ToolSchema[] {
    return structuredClone([...this.tools.values()].map(tool => tool.schema));
  }

  /** 取消后禁止开始执行；未知工具报错，工具异常交给 Loop 处理。 */
  execute(name: string, args: unknown, notify: AgentObserver, context: ToolExecutionContext): unknown | Promise<unknown> {
    context.signal?.throwIfAborted();
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`工具未注册：${name}`);
    return tool.execute(args, notify, context);
  }

  /** 使用已注册工具的投影；未知工具及未提供策略的工具默认隐藏正文。 */
  publicToolEvent(call: ToolCallRecord): Record<string, unknown> {
    return publicToolEvent(call, this.tools.get(call.tool)?.eventProjection);
  }
}
