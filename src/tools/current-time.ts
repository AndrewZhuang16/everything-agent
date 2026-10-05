import type { LocalTool } from "./types.ts";

export const TIME_TOOL = "get_current_time";
export const timeToolSchema = {
  name: TIME_TOOL,
  description: "读取 Agent 所在服务器的当前日期、时间和时区。需要回答当前时间时必须调用此工具。",
  input_schema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
} as const;

/** 读取宿主当前时间，不接受参数。 */
export const currentTimeTool: LocalTool = {
  schema: timeToolSchema,
  execute(args) {
    if (!isEmptyObject(args)) throw new TypeError(`${TIME_TOOL} 不接受参数`);
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return {
      iso: now.toISOString(),
      timeZone,
      local: new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "full",
        timeStyle: "long",
        timeZone,
      }).format(now),
    };
  },
};
function isEmptyObject(value: unknown): value is Record<string, never> {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.keys(value).length === 0;
}
