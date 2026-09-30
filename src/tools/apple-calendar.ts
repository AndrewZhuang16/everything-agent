import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ToolExecutionContext } from "../agent-loop/agent-loop.ts";
import type { ApprovalGate } from "./approval.ts";

const runFile = promisify(execFile);
export const APPLE_CALENDAR_TOOL = "create_calendar_event";
export const appleCalendarSchema = {
  name: APPLE_CALENDAR_TOOL,
  description: "在运行 Agent 的 Mac 上创建 Apple Calendar 日程，写入前需用户确认。优先使用 Everything Agent 日历，无法创建时使用第一个可写日历。相同标题和开始时间不会重复创建。不发送邀请。",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "日程标题" },
      start: { type: "string", description: "含时区的 ISO 时间，如 2026-10-01T09:00:00+08:00" },
      end: { type: "string", description: "含时区的 ISO 时间，默认开始后一小时" },
      notes: { type: "string", description: "日程备注" },
    },
    required: ["title", "start"],
    additionalProperties: false,
  },
} as const;

// 固定脚本与参数分离，标题、备注等私人内容不会被解释为脚本或 shell 命令。
const CREATE_SCRIPT = `function run(argv) {
  const input = JSON.parse(argv[0]);
  const app = Application("Calendar");
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

/** 创建受控的 Apple Calendar 日程；拒绝确认、非 macOS 或执行失败时抛错，不宣称写入成功。 */
export class AppleCalendarTool {
  private pending: Promise<unknown> = Promise.resolve();
  private readonly approval: ApprovalGate | undefined;
  constructor(approval?: ApprovalGate) { this.approval = approval; }

  async execute(value: unknown, context: ToolExecutionContext): Promise<unknown> {
    context.signal?.throwIfAborted();
    if (process.platform !== "darwin") throw new Error("Apple Calendar 仅支持 macOS");
    const input = parseInput(value);
    const approved = await this.approval?.request({
      kind: "irreversible",
      command: JSON.stringify({ tool: APPLE_CALENDAR_TOOL, ...input }),
      reason: "即将向 Apple Calendar 写入日程；无法创建专用日历时会使用第一个可写日历。",
    }, context.signal);
    if (!approved) throw new Error("用户未确认创建日程");
    // 同一注册表中的并发调用串行访问日历，避免查询后创建的竞争。
    const task = this.pending.then(async () => {
      context.signal?.throwIfAborted();
      try {
        const { stdout } = await runFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", CREATE_SCRIPT, JSON.stringify(input)], {
          encoding: "utf8", timeout: 30_000, maxBuffer: 64 * 1024,
          ...(context.signal ? { signal: context.signal } : {}),
        });
        const result: unknown = JSON.parse(stdout);
        if (!result || typeof result !== "object" || !("status" in result)
          || !["created", "existing"].includes(String(result.status))
          || !("calendar" in result) || typeof result.calendar !== "string" || !result.calendar
          || !("eventId" in result) || typeof result.eventId !== "string" || !result.eventId) {
          throw new Error("日历返回了无效结果");
        }
        return { ...result, source: "Apple Calendar", approved: true };
      } catch {
        // 子进程错误可能携带完整命令与私人内容，不向日志传播原始异常。
        context.signal?.throwIfAborted();
        throw new Error("Apple Calendar 执行失败或超时，写入状态未知。请检查 macOS 自动化权限及日历后再重试。");
      }
    });
    this.pending = task.catch(() => undefined);
    return task;
  }
}

function parseInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("日程参数必须是对象");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["title", "start", "end", "notes"].includes(key))) throw new TypeError("日程包含未知参数");
  const title = text(input.title, "标题", 500).trim();
  if (!title) throw new TypeError("日程标题不能为空");
  const start = parseDate(input.start);
  const end = input.end === undefined ? new Date(start.getTime() + 3_600_000) : parseDate(input.end);
  if (end <= start || !Number.isFinite(end.getTime())) throw new TypeError("结束时间必须晚于开始时间");
  return { title, start: start.toISOString(), end: end.toISOString(), notes: input.notes === undefined ? "" : text(input.notes, "备注", 10_000) };
}

function text(value: unknown, label: string, limit: number): string {
  if (typeof value !== "string" || value.length > limit || value.includes("\0")) throw new TypeError(`${label}必须是最多 ${limit} 字符且不含空字符的字符串`);
  return value;
}

function parseDate(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new TypeError("时间必须是包含时区的 ISO 日期时间");
  const date = new Date(value);
  const day = Number(value.slice(8, 10));
  const month = Number(value.slice(5, 7));
  const year = Number(value.slice(0, 4));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > days || Number(value.slice(11, 13)) > 23) throw new TypeError("日程时间无效");
  return date;
}
