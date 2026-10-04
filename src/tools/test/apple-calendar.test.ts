import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { LocalToolRegistry } from "../tool-registry.ts";
import type { ToolExecutionContext } from "../../agent-loop/agent-loop.ts";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("node:child_process", () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: execute }) }));
const input = { action: "create", title: '讨论 "计划"\\\n中文', start: "2026-10-01T09:00:00+08:00", notes: "私人备注" };
const context: ToolExecutionContext = { signal: undefined, deadline: null, iteration: 1, toolUseId: "calendar-1" };
const request = vi.fn();
function registry(enabled = true) { return new LocalToolRegistry(undefined, undefined, undefined, undefined, { appleCalendarEnabled: enabled, approval: { request } }); }
function call(args: unknown = input, ctx = context, tools = registry()) { return tools.execute("manage_calendar", args, () => {}, ctx); }
beforeEach(() => {
  vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
  request.mockReset().mockResolvedValue(true);
  execute.mockReset().mockResolvedValue({ stdout: JSON.stringify({ status: "created", calendar: "Everything Agent", eventId: "uid-1" }) });
});
afterEach(() => vi.restoreAllMocks());

it("默认禁用，非 macOS 不注册", () => {
  expect(registry(false).schemas()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "manage_calendar" })]));
  vi.spyOn(process, "platform", "get").mockReturnValue("linux");
  expect(() => call()).toThrow("未注册");
});
it("先确认再写入，保留文本并正确转换时区、默认一小时", async () => {
  await expect(call()).resolves.toMatchObject({ status: "created", source: "Apple Calendar", approved: true });
  expect(request).toHaveBeenCalledWith(expect.objectContaining({ kind: "irreversible", command: expect.stringContaining("私人备注") }), undefined);
  const [path, args, options] = execute.mock.calls[0]!;
  expect(path).toBe("/usr/bin/osascript");
  expect(args[3]).not.toContain(input.title);
  expect(JSON.parse(args[4])).toEqual({ ...input, start: "2026-10-01T01:00:00.000Z", end: "2026-10-01T02:00:00.000Z" });
  expect(options).toMatchObject({ timeout: 30_000, maxBuffer: 65536 });
});
it.each([false, undefined])("无确认通道或拒绝确认不写入：%s", async (approved) => {
  request.mockResolvedValue(approved);
  const tools = approved === undefined ? new LocalToolRegistry(undefined, undefined, undefined, undefined, { appleCalendarEnabled: true }) : registry();
  await expect(call(input, context, tools)).rejects.toThrow("未确认");
  expect(execute).not.toHaveBeenCalled();
});
it.each([null, [], {}, { ...input, title: " " }, { ...input, title: 1 }, { ...input, title: "x".repeat(501) }, { ...input, notes: "\0" }, { ...input, extra: true }, { ...input, start: "2026-10-01T09:00" }, { ...input, start: "2026-02-30T09:00Z" }, { ...input, start: "2026-13-01T09:00Z" }, { ...input, start: "2026-01-00T09:00Z" }, { ...input, start: "2026-01-01T24:00Z" }, { ...input, end: "2026-10-01T00:00Z" }])("非法日程不会确认或执行：%j", async (args) => {
  await expect(call(args)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
it("已有事件返回真实来源与重复状态", async () => {
  execute.mockResolvedValue({ stdout: JSON.stringify({ status: "existing", calendar: "工作", eventId: "existing-1" }) });
  await expect(call({ action: "create", title: "会议", start: input.start, end: "2026-10-01T10:30+08:00" })).resolves.toMatchObject({ status: "existing", calendar: "工作" });
});
it.each(["", "{}", '{"status":"created"}', '{"status":"created","calendar":"x","eventId":""}', "null"])("无效返回不报告成功：%s", async (stdout) => {
  execute.mockResolvedValue({ stdout });
  await expect(call()).rejects.toThrow("状态未知");
});
it("权限错误和超时不泄露参数，后续调用仍能执行", async () => {
  execute.mockRejectedValueOnce(new Error("私人备注"));
  const tools = registry();
  await expect(call(input, context, tools)).rejects.toThrow("状态未知");
  await expect(call(input, context, tools)).resolves.toMatchObject({ status: "created" });
});
it("审批期间取消不会启动子进程", async () => {
  const controller = new AbortController();
  request.mockImplementation(async () => { controller.abort(new Error("取消")); return true; });
  await expect(call(input, { ...context, signal: controller.signal })).rejects.toThrow("取消");
  expect(execute).not.toHaveBeenCalled();
});
it("执行期间取消传给子进程并传播取消原因", async () => {
  const controller = new AbortController();
  execute.mockImplementation(async () => { controller.abort(new Error("取消")); throw new Error("终止"); });
  await expect(call(input, { ...context, signal: controller.signal })).rejects.toThrow("取消");
  expect(execute.mock.calls[0]![2].signal).toBe(controller.signal);
});
it("固定脚本在日历端去重并回退至可写日历", async () => {
  await call();
  const script = execute.mock.calls[0]![1][3];
  const events: { summary: string; startDate: Date; uid: () => string }[] = [];
  const push = vi.fn((event) => events.push(event));
  const eventCollection = { push, whose: (query: { summary: string; startDate?: Date }) => {
    // Calendar 的复合属性筛选会报 -1725，不能用普通数组筛选掩盖此错误。
    if (query.startDate) throw new Error("调用了非法逻辑运算符。 (-1725)");
    return () => events.filter((event) => event.summary === query.summary).map((event) => ({
      uid: event.uid, startDate: () => event.startDate,
    }));
  } };
  const calendar = { name: () => "工作", events: eventCollection };
  const app = { calendars: { whose: (query: { writable?: boolean }) => query.writable ? [calendar] : [], push: () => { throw new Error("iCloud 无法创建日历"); } }, Calendar: () => ({}), Event: (values: object) => ({ ...values, uid: () => "uid" }) };
  const run = new Function("Application", `${script}; return run;`)(() => app);
  const args = [execute.mock.calls[0]![1][4]];
  expect(JSON.parse(run(args))).toMatchObject({ status: "created", calendar: "工作" });
  expect(JSON.parse(run(args))).toMatchObject({ status: "existing", calendar: "工作" });
  expect(push).toHaveBeenCalledTimes(1);
  const later = { ...JSON.parse(args[0]), start: "2026-10-02T01:00:00.000Z", end: "2026-10-02T02:00:00.000Z" };
  expect(JSON.parse(run([JSON.stringify(later)]))).toMatchObject({ status: "created" });
  expect(push).toHaveBeenCalledTimes(2);
});

it("查询无需确认并返回日程", async () => {
  execute.mockResolvedValue({ stdout: JSON.stringify({ status: "queried", events: [], truncated: false }) });
  await expect(call({ action: "query", start: input.start, end: "2026-10-02T09:00+08:00" })).resolves.toMatchObject({ status: "queried", events: [], approved: false });
  expect(request).not.toHaveBeenCalled();
});
it("修改必须确认并按日历和事件标识定位", async () => {
  execute.mockResolvedValue({ stdout: JSON.stringify({ status: "updated", calendar: "工作", eventId: "uid-1" }) });
  await expect(call({ action: "update", calendar: "工作", eventId: "uid-1", notes: "新备注" })).resolves.toMatchObject({ status: "updated", approved: true });
  expect(request).toHaveBeenCalledOnce();
});
it.each([
  { action: "query", start: input.start },
  { action: "query", start: input.start, end: "2027-10-01T09:00Z" },
  { action: "update", calendar: "工作", eventId: "uid" },
  { action: "update", eventId: "uid", title: "新标题" },
  { action: "delete" },
])("拒绝非法操作参数：%j", async (args) => {
  await expect(call(args)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});
it("查询脚本按重叠时间筛选、排序并限制条数，修改脚本保留未指定字段", async () => {
  await call();
  const script = execute.mock.calls[0]![1][3];
  const first = { uid: () => "uid-1", summary: () => "会议", startDate: () => new Date("2026-10-01T01:00Z"), endDate: () => new Date("2026-10-01T02:00Z"), description: () => "备注", recurrence: () => "" };
  const second = { ...first, uid: () => "uid-2", startDate: () => new Date("2026-10-01T00:00Z") };
  const outside = { ...first, uid: () => "outside", startDate: () => new Date("2026-10-03T01:00Z"), endDate: () => new Date("2026-10-03T02:00Z") };
  const events = Object.assign(() => [first, second, outside], { whose: (query: { uid: string }) => () => [first, second, outside].filter((event) => event.uid() === query.uid) });
  const calendar = { name: () => "工作", writable: () => true, events };
  const calendars = Object.assign(() => [calendar], { whose: (query: { name: string }) => () => query.name === "工作" ? [calendar] : [] });
  const run = new Function("Application", `${script}; return run;`)(() => ({ calendars }));
  const query = { action: "query", start: "2026-10-01T00:30Z", end: "2026-10-02T00:00Z", limit: 1 };
  expect(JSON.parse(run([JSON.stringify(query)]))).toMatchObject({ status: "queried", truncated: true, events: [{ eventId: "uid-2", calendar: "工作", notes: "备注" }] });
  expect(JSON.parse(run([JSON.stringify({ ...query, calendar: "不存在" })]))).toMatchObject({ events: [], truncated: false });
  expect(() => run([JSON.stringify({ action: "update", calendar: "工作", eventId: "missing", title: "新标题" })])).toThrow("定位日程");
  expect(() => run([JSON.stringify({ action: "update", calendar: "工作", eventId: "uid-1", end: "2026-09-01T00:00Z" })])).toThrow("结束时间");
  expect(JSON.parse(run([JSON.stringify({ action: "update", calendar: "工作", eventId: "uid-1", notes: "" })]))).toMatchObject({ status: "updated", eventId: "uid-1" });
  expect(first.description).toBe("");
  expect(first.summary()).toBe("会议");
});
it("查询失败不声称写入状态未知且不泄露私人内容", async () => {
  execute.mockRejectedValue(new Error("私人日历"));
  await expect(call({ action: "query", start: input.start, end: "2026-10-02T09:00+08:00" })).rejects.toThrow("查询失败");
  expect(request).not.toHaveBeenCalled();
});
it("查询拒绝格式错误的返回", async () => {
  execute.mockResolvedValue({ stdout: JSON.stringify({ status: "queried", events: [{ title: "私人标题" }], truncated: false }) });
  await expect(call({ action: "query", start: input.start, end: "2026-10-02T09:00+08:00" })).rejects.toThrow("查询失败");
});

it("修改接受查询返回的含毫秒 ISO 时间", async () => {
  execute.mockResolvedValue({ stdout: JSON.stringify({ status: "updated", calendar: "工作", eventId: "uid" }) });
  await expect(call({ action: "update", calendar: "工作", eventId: "uid", start: "2026-10-01T01:00:00.000Z", end: "2026-10-01T02:00:00.000Z" })).resolves.toMatchObject({ status: "updated" });
});
