import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolExecutionContext } from "../../agent-loop/agent-loop.ts";
import type { ApprovalGate } from "../approval.ts";

const runFile = promisify(execFile);
export const APPLE_CALENDAR_TOOL = "manage_calendar";
export const appleCalendarSchema = {
  name: APPLE_CALENDAR_TOOL,
  description: "在运行 Agent 的 Mac 上查询、创建或修改 Apple Calendar 日程。action 必填：query 按时间范围查询（最多31天），返回 calendar 和 eventId，不展开重复规则的未来实例；update 用这两个标识修改指定字段；create 创建日程。查询无需确认，修改和创建需用户确认。优先使用 Everything Agent 日历，无法创建时使用第一个可写日历。相同标题和开始时间不会重复创建。不发送邀请。",
  input_schema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["query", "create", "update"] },
      calendar: { type: "string", description: "日历名称；查询可选过滤，修改必填" },
      eventId: { type: "string", description: "修改必填，使用查询返回的事件标识，不支持修改重复日程" },
      limit: { type: "integer", minimum: 1, maximum: 100, description: "查询最多返回条数，默认50；truncated=true时缩小时间范围" },
      title: { type: "string", description: "日程标题" },
      start: { type: "string", description: "含时区的 ISO 时间，如 2026-10-01T09:00:00+08:00" },
      end: { type: "string", description: "含时区的 ISO 时间，默认开始后一小时" },
      notes: { type: "string", description: "日程备注" },
    },
    required: ["action"],
    additionalProperties: false,
  },
} as const;

// 固定脚本与参数分离，标题、备注等私人内容不会被解释为脚本或 shell 命令。
const CREATE_SCRIPT = `function run(argv) {
  const input = JSON.parse(argv[0]);
  const app = Application("Calendar");
  if (input.action === "query") {
    const calendars = input.calendar ? app.calendars.whose({name: input.calendar})() : app.calendars();
    const events = [];
    calendars.forEach(function(calendar) {
      // 先由 Calendar 筛选重叠区间，避免跨进程逐条读取全部历史日程导致超时。
      // 复合条件必须显式使用 _and；普通对象中的多个属性不能可靠表达此筛选。
      calendar.events.whose({_and: [
        {startDate: {_lessThan: new Date(input.end)}},
        {endDate: {_greaterThan: new Date(input.start)}}
      ]})().forEach(function(event) {
        const start = event.startDate(); const end = event.endDate();
        if (start < new Date(input.end) && end > new Date(input.start)) {
          events.push({calendar: calendar.name(), eventId: event.uid(), title: event.summary(), start: start.toISOString(), end: end.toISOString(), notes: event.description() || ""});
        }
      });
    });
    events.sort(function(a, b) { return a.start.localeCompare(b.start) || a.calendar.localeCompare(b.calendar) || a.eventId.localeCompare(b.eventId); });
    return JSON.stringify({status: "queried", events: events.slice(0, input.limit), truncated: events.length > input.limit});
  }
  if (input.action === "update") {
    const calendars = app.calendars.whose({name: input.calendar})();
    if (calendars.length !== 1 || !calendars[0].writable()) throw new Error("无法唯一定位可写日历");
    const matches = calendars[0].events.whose({uid: input.eventId})();
    if (matches.length !== 1) throw new Error("无法唯一定位日程");
    const event = matches[0];
    if (event.recurrence()) throw new Error("暂不支持修改重复日程");
    const start = input.start ? new Date(input.start) : event.startDate();
    const end = input.end ? new Date(input.end) : event.endDate();
    if (end <= start) throw new Error("结束时间必须晚于开始时间");
    if (input.title !== undefined) event.summary = input.title;
    // 向后移动整个时间段时先延后结束时间，避免中间状态的开始时间晚于结束时间。
    if (input.end !== undefined && start >= event.endDate()) event.endDate = end;
    if (input.start !== undefined) event.startDate = start;
    if (input.end !== undefined) event.endDate = end;
    if (input.notes !== undefined) event.description = input.notes;
    return JSON.stringify({status: "updated", calendar: calendars[0].name(), eventId: event.uid()});
  }
  const preferred = app.calendars.whose({name: "Everything Agent"});
  let calendar;
  if (preferred.length && preferred[0].writable()) calendar = preferred[0];
  if (!calendar && !preferred.length) {
    try {
      calendar = app.Calendar({name: "Everything Agent"});
      app.calendars.push(calendar);
    } catch (_) { calendar = null; }
  }
  if (!calendar) {
    const writable = app.calendars.whose({writable: true});
    if (!writable.length) throw new Error("没有可写日历");
    calendar = writable[0];
  }
  const start = new Date(input.start);
  // Calendar 不接受此处的复合属性筛选（-1725）；先按标题查询，再比较绝对时间。
  const existing = calendar.events.whose({summary: input.title})().filter(function(event) {
    return event.startDate().getTime() === start.getTime();
  });
  if (existing.length) return JSON.stringify({status: "existing", calendar: calendar.name(), eventId: existing[0].uid()});
  const event = app.Event({summary: input.title, startDate: start, endDate: new Date(input.end), description: input.notes});
  calendar.events.push(event);
  return JSON.stringify({status: "created", calendar: calendar.name(), eventId: event.uid()});
}`;

/** 查询或受控写入 Apple Calendar 日程；拒绝确认、非 macOS 或执行失败时抛错，不宣称写入成功。 */
export class AppleCalendarTool {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly approval: ApprovalGate | undefined;
  constructor(approval?: ApprovalGate) { this.approval = approval; }

  async execute(value: unknown, context: ToolExecutionContext): Promise<unknown> {
    context.signal?.throwIfAborted();
    if (process.platform !== "darwin") throw new Error("Apple Calendar 仅支持 macOS");
    const input = parseInput(value);
    const approved = input.action === "query" ? false : await this.approval?.request({
      kind: "irreversible",
      command: JSON.stringify({ tool: APPLE_CALENDAR_TOOL, ...input }),
      reason: input.action === "update" ? "即将修改 Apple Calendar 中指定的日程。" : "即将向 Apple Calendar 写入日程；无法创建专用日历时会使用第一个可写日历。",
    }, context.signal);
    if (input.action !== "query" && !approved) throw new Error("用户未确认写入日程");
    // 同一注册表中的并发调用串行访问日历，避免查询后创建的竞争。
    const task = this.pending.then(async () => {
      context.signal?.throwIfAborted();
      try {
        const { stdout } = await runFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", CREATE_SCRIPT, JSON.stringify(input)], {
          encoding: "utf8", timeout: 30_000, maxBuffer: input.action === "query" ? 8 * 1024 * 1024 : 64 * 1024,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        const result: unknown = JSON.parse(stdout);
        validateResult(result, input.action);
        return { ...result, source: "Apple Calendar", approved: approved === true };
      } catch {
        // 子进程错误可能携带完整命令与私人内容，不向日志传播原始异常。
        context.signal?.throwIfAborted();
        throw new Error(input.action === "query" ? "Apple Calendar 查询失败或超时，请检查 macOS 自动化权限。" : "Apple Calendar 执行失败或超时，写入状态未知。请检查 macOS 自动化权限及日历后再重试。");
      }
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
}

interface CalendarInput {
  action: "query" | "create" | "update";
  calendar?: string; eventId?: string; limit?: number;
  title?: string; start?: string; end?: string; notes?: string;
}

function parseInput(value: unknown): CalendarInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("日程参数必须是对象");
  const input = value as Record<string, unknown>;
  const action = input.action;
  if (action !== "query" && action !== "create" && action !== "update") throw new TypeError("action 必须是 query、create 或 update");
  const allowed = action === "query" ? ["action", "calendar", "start", "end", "limit"] : action === "create" ? ["action", "title", "start", "end", "notes"] : ["action", "calendar", "eventId", "title", "start", "end", "notes"];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new TypeError("日程包含未知参数");
  const result: CalendarInput = { action };
  for (const key of ["title", "calendar", "eventId", "notes"] as const) {
    if (input[key] !== undefined) {
      result[key] = text(input[key], key, key === "notes" ? 10_000 : 500);
      if (key !== "notes") { result[key] = result[key].trim(); if (!result[key]) throw new TypeError(`${key} 不能为空`); }
    }
  }
  for (const key of ["start", "end"] as const) if (input[key] !== undefined) result[key] = parseDate(input[key]).toISOString();
  if (action === "create") {
    if (!result.title || !result.start) throw new TypeError("创建需要标题和开始时间");
    result.end ??= new Date(new Date(result.start).getTime() + 3_600_000).toISOString();
    result.notes ??= "";
  } else if (action === "query") {
    if (!result.start || !result.end) throw new TypeError("查询需要开始和结束时间");
    if (new Date(result.end).getTime() - new Date(result.start).getTime() > 31 * 86_400_000) throw new TypeError("查询范围不能超过31天");
    const limit = input.limit ?? 50;
    if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError("limit 必须是1到100的整数");
    result.limit = limit;
  } else {
    if (!result.calendar || !result.eventId) throw new TypeError("修改需要日历名称和事件标识");
    if (!["title", "start", "end", "notes"].some((key) => input[key] !== undefined)) throw new TypeError("修改至少需要一个变更字段");
  }
  if (result.start && result.end && result.end <= result.start) throw new TypeError("结束时间必须晚于开始时间");
  return result;
}

function validateResult(value: unknown, action: CalendarInput["action"]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("日历返回了无效结果");
  const result = value as Record<string, unknown>;
  const identified = (item: Record<string, unknown>) => typeof item.calendar === "string" && !!item.calendar && typeof item.eventId === "string" && !!item.eventId;
  if (action === "query") {
    if (result.status !== "queried" || typeof result.truncated !== "boolean" || !Array.isArray(result.events) || result.events.length > 100 || result.events.some((event) => !event || typeof event !== "object" || !identified(event) || typeof event.title !== "string" || typeof event.notes !== "string" || typeof event.start !== "string" || !Number.isFinite(Date.parse(event.start)) || typeof event.end !== "string" || !Number.isFinite(Date.parse(event.end)))) throw new Error("日历返回了无效结果");
  } else if (!identified(result) || !(action === "create" ? ["created", "existing"] : ["updated"]).includes(String(result.status))) throw new Error("日历返回了无效结果");
}

function text(value: unknown, label: string, limit: number): string {
  if (typeof value !== "string" || value.length > limit || value.includes("\0")) throw new TypeError(`${label}必须是最多 ${limit} 字符且不含空字符的字符串`);
  return value;
}

function parseDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new TypeError("时间必须是包含时区的 ISO 日期时间");
  const date = new Date(value);
  const day = Number(value.slice(8, 10));
  const month = Number(value.slice(5, 7));
  const year = Number(value.slice(0, 4));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > days || Number(value.slice(11, 13)) > 23) throw new TypeError("日程时间无效");
  return date;
}
