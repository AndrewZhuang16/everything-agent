import type { AgentObserver, ToolCallRecord, ToolExecutionContext, ToolRegistry } from "../agent-loop/agent-loop.ts";

/** 工具向模型公开的名称、说明与参数约束。 */
export interface ToolSchema {
  name: string;
  description: string;
  input_schema: unknown;
}

/** 将工具参数与结果转换为可公开记录的元数据。 */
export interface ToolEventProjection {
  arguments(value: unknown): unknown;
  result(value: unknown): unknown;
  /** 缺省时隐藏错误正文；需要展示时由工具负责移除私人内容。 */
  error?(value: unknown): unknown;
}

/** 注入注册表的工具；参数校验和业务依赖由实现持有。 */
export interface LocalTool {
  schema: ToolSchema;
  execute(args: unknown, notify: AgentObserver, context: ToolExecutionContext): unknown | Promise<unknown>;
  eventProjection?: ToolEventProjection;
}

/** Runtime 使用的工具集合，执行与事件展示共用同一份注册信息。 */
export interface ToolCollection extends ToolRegistry {
  publicToolEvent(call: ToolCallRecord): Record<string, unknown>;
}
