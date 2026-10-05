import { ManageEverythingTool, manageEverythingSchema } from "./builtin/manage-everything.ts";
import type { MemoryRuntime } from "../memory/index.ts";
import { ReadSkillTool, readSkillSchema, type SkillStore } from "../skills/index.ts";
import { ManageMemoryTool, manageMemorySchema } from "./builtin/manage-memory.ts";
import {
  SessionRecallTools,
  sessionReadSchema,
  sessionSearchSchema,
} from "./builtin/session-recall.ts";
import { TavilySearchTool, searchWebSchema } from "./builtin/tavily-search.ts";
import { TerminalTool, runTerminalSchema } from "./builtin/terminal.ts";
import type { ApprovalGate } from "./approval.ts";

import { AppleCalendarTool, appleCalendarSchema } from "./builtin/apple-calendar.ts";

import { detectSandbox } from "../sandbox/index.ts";
import { LocalToolRegistry } from "./tool-registry.ts";
import { currentTimeTool } from "./builtin/current-time.ts";
import { builtinToolEventProjection } from "./tool-events.ts";
import type { LocalTool, ToolCollection } from "./types.ts";
import type { ToolSettings } from "./tool-settings.ts";

export interface LocalToolOptions {
  /** 当前运行时常驻规则的读写能力。 */
  everythingConfig?: ConstructorParameters<typeof ManageEverythingTool>[0];
  appleCalendarEnabled?: boolean;
  getCurrentTimeEnabled?: boolean;
  searchWebEnabled?: boolean;
  tavilyApiKey?: string;
  terminalEnabled?: boolean;
  /** 终端工具的工作区根，启用时必填。 */
  terminalWorkspaceRoot?: string;
  /** 终端工具可写的临时目录，同时作为子进程 TMPDIR。 */
  terminalSessionTempDir?: string;
  /** 人工审批通道；缺省时需要审批的命令一律拒绝执行。 */
  approval?: ApprovalGate;
}

/** 每次装配所需的能力与会话上下文；不引用 Runtime 的配置实现。 */
export interface ToolFactoryContext {
  memory?: MemoryRuntime;
  memoryManagement?: NonNullable<ConstructorParameters<typeof ManageMemoryTool>[1]>;
  recall?: { currentSessionId: string; settings: import("../memory/index.ts").SessionRecallSettings };
  skills?: SkillStore;
  settings?: ToolSettings;
  options?: LocalToolOptions;
}

/** 应用可替换的工具装配入口，执行与请求预览共用。 */
export type ToolFactory = (context: ToolFactoryContext) => ToolCollection | Promise<ToolCollection>;

/** 装配内置工具；不可用的终端不注册，不降级为无沙箱执行。 */
export function createBuiltinTools(context: ToolFactoryContext = {}): LocalToolRegistry {
  const { memory, recall, skills } = context;
  const options = { ...context.settings, ...context.options };
  const tools: LocalTool[] = [];
  const add = (schema: LocalTool["schema"], execute: LocalTool["execute"]) => {
    tools.push({ schema, execute, eventProjection: builtinToolEventProjection(schema.name) });
  };
  if (options.getCurrentTimeEnabled ?? true) add(currentTimeTool.schema, currentTimeTool.execute);
  if (options.everythingConfig) {
    const tool = new ManageEverythingTool(options.everythingConfig);
    add(manageEverythingSchema, (args, _notify, ctx) => tool.execute(args, ctx));
  }
  const manageMemory = memory ? new ManageMemoryTool(memory, context.memoryManagement) : null;
  if (manageMemory) add(manageMemorySchema, (args, notify, ctx) => manageMemory.execute(args, notify, ctx));
  if (memory && recall) {
    const tool = new SessionRecallTools(memory, recall.currentSessionId, recall.settings);
    for (const schema of [sessionSearchSchema, sessionReadSchema]) add(schema, (args, notify) => tool.execute(schema.name, args, notify));
  }
  if (skills) {
    const tool = new ReadSkillTool(skills);
    add(readSkillSchema, (args, notify, ctx) => tool.execute(args, notify, ctx));
  }
  if (options.searchWebEnabled && options.tavilyApiKey) {
    const tool = new TavilySearchTool(options.tavilyApiKey);
    add(searchWebSchema, (args, _notify, ctx) => tool.execute(args, ctx));
  }
  if (options.appleCalendarEnabled && process.platform === "darwin") {
    const tool = new AppleCalendarTool(options.approval);
    add(appleCalendarSchema, (args, _notify, ctx) => tool.execute(args, ctx));
  }
  if (options.terminalEnabled && options.terminalWorkspaceRoot && detectSandbox().available) {
    const tool = new TerminalTool({
      workspaceRoot: options.terminalWorkspaceRoot,
      sessionTempDir: options.terminalSessionTempDir || options.terminalWorkspaceRoot,
      ...(options.approval ? { approval: options.approval } : {}),
    });
    add(runTerminalSchema, (args, notify, ctx) => tool.execute(args, notify, ctx));
  }
  return new LocalToolRegistry(tools);
}
