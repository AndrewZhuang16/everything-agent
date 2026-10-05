import { describe, expect, it, vi } from "vitest";
import { LocalToolRegistry } from "../index.ts";

const context = { signal: undefined, deadline: null, iteration: 1, toolUseId: "调用" };
const schema = { name: "独立工具", description: "测试工具", input_schema: { type: "object" } };

describe("通用工具注册表", () => {
  it("通过注入的工具执行并透传上下文和观察者", () => {
    const execute = vi.fn(() => ({ done: true }));
    const notify = vi.fn();
    const registry = new LocalToolRegistry([{ schema, execute }]);
    expect(registry.schemas()).toEqual([schema]);
    expect(registry.execute(schema.name, { value: 1 }, notify, context)).toEqual({ done: true });
    expect(execute).toHaveBeenCalledWith({ value: 1 }, notify, context);
  });
  it("拒绝重名工具", () => {
    const tool = { schema, execute: vi.fn() };
    expect(() => new LocalToolRegistry([tool, tool])).toThrow(/重名/);
  });
  it("拒绝未知工具并在取消后阻止执行", () => {
    const execute = vi.fn();
    const registry = new LocalToolRegistry([{ schema, execute }]);
    expect(() => registry.execute("未知", {}, vi.fn(), context)).toThrow(/未注册/);
    const signal = AbortSignal.abort(new Error("已取消"));
    expect(() => registry.execute(schema.name, {}, vi.fn(), { ...context, signal })).toThrow("已取消");
    expect(execute).not.toHaveBeenCalled();
  });
  it("未知工具的公开事件默认隐藏私人内容", () => {
    const registry = new LocalToolRegistry([{ schema, execute: vi.fn() }]);
    expect(registry.publicToolEvent({ tool: schema.name, args: { content: "私人正文" }, result: "私人结果", output: "私人结果", isError: false, toolUseId: "调用", iteration: 1 })).toMatchObject({ arguments: { redacted: true }, result: { redacted: true } });
  });
});

it("schema 返回独立快照，空注册表不装配内置工具", () => {
  expect(new LocalToolRegistry().schemas()).toEqual([]);
  const registry = new LocalToolRegistry([{ schema, execute: vi.fn() }]);
  registry.schemas()[0]!.name = "被修改";
  expect(registry.schemas()[0]!.name).toBe(schema.name);
});

it("工具自有投影仍递归移除凭证，未提供错误投影时隐藏失败正文", () => {
  const registry = new LocalToolRegistry([{
    schema, execute: vi.fn(),
    eventProjection: { arguments: value => value, result: value => value },
  }]);
  const call = { tool: schema.name, args: { nested: [{ apiKey: "秘密", value: 1 }] }, result: { access_token: "秘密", status: "完成" }, output: "秘密", isError: false, toolUseId: "调用", iteration: 1 };
  expect(registry.publicToolEvent(call)).toMatchObject({
    arguments: { nested: [{ apiKey: "[凭证已移除]", value: 1 }] },
    result: { access_token: "[凭证已移除]", status: "完成" },
  });
  expect(registry.publicToolEvent({ ...call, isError: true, result: "私人错误" }).result).toEqual({ redacted: true });
  expect(registry.publicToolEvent({ ...call, tool: "未知" }).arguments).toEqual({ redacted: true });
});

it("工具异常原样交给调用方，并支持自有错误投影", () => {
  const error = new Error("执行失败");
  const registry = new LocalToolRegistry([{
    schema, execute: () => { throw error; },
    eventProjection: { arguments: () => ({}), result: () => ({}), error: () => ({ code: "FAILED" }) },
  }]);
  expect(() => registry.execute(schema.name, {}, vi.fn(), context)).toThrow(error);
  expect(registry.publicToolEvent({ tool: schema.name, args: {}, result: "私人错误", output: "错误", isError: true, toolUseId: "调用", iteration: 1 }).result).toEqual({ code: "FAILED" });
});
