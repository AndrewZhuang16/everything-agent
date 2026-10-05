import { describe, expect, it } from "vitest";
import { publicToolEvent as projectToolEvent, builtinToolEventProjection } from "../index.ts";
import type { ToolCallRecord } from "../../agent-loop/agent-loop.ts";

function publicToolEvent(call: ToolCallRecord) {
  return projectToolEvent(call, builtinToolEventProjection(call.tool));
}

function failedCall(tool: string, message: string): ToolCallRecord {
  return {
    tool,
    args: { action: "submit" },
    result: `工具 ${tool} 执行失败：${message}`,
    output: `工具 ${tool} 执行失败：${message}`,
    toolUseId: "call-1",
    iteration: 1,
    isError: true,
  };
}

describe("publicToolEvent 失败态", () => {
  it("manage_memory 失败时保留真实错误信息，而不是 {redacted:true}", () => {
    const event = publicToolEvent(failedCall("manage_memory", "submit 缺少必填字段：intent、subject、attribute、content"));
    expect(event.result).toContain("submit 缺少必填字段");
  });

  it("read_skill 失败时保留真实错误信息，而不是 {redacted:true}", () => {
    const event = publicToolEvent(failedCall("read_skill", "未找到指定技能"));
    expect(event.result).toContain("未找到指定技能");
  });
});

it("日历事件只展示结果状态，不暴露日程内容和日历标识", () => {
  const event = publicToolEvent({ ...failedCall("manage_calendar", ""),
    isError: false, args: { title: "私人标题", notes: "私人内容", start: "2026-10-01" },
    result: { status: "created", approved: true, source: "Apple Calendar", calendar: "私人日历", eventId: "秘密标识" },
  });
  expect(event.arguments).toEqual({ redacted: true });
  expect(event.result).toEqual({ status: "created", approved: true, source: "Apple Calendar" });
  expect(JSON.stringify(event)).not.toMatch(/私人|秘密/);
});
it("日历查询结果的私人正文和标识不进入事件流", () => {
  const event = publicToolEvent({ ...failedCall("manage_calendar", ""), isError: false,
    args: { action: "query", calendar: "私人日历" },
    result: { status: "queried", approved: false, source: "Apple Calendar", events: [{ title: "私人标题", eventId: "秘密标识" }] },
  });
  expect(event.arguments).toEqual({ redacted: true });
  expect(event.result).toEqual({ status: "queried", approved: false, source: "Apple Calendar" });
});

it("常驻规则读写事件仅保留元数据，不泄露正文", () => {
  for (const action of ["read", "write"]) {
    const event = publicToolEvent({ ...failedCall("manage_everything", ""), isError: false,
      args: { action, content: "私人规则正文" },
      result: { action, content: "私人规则正文", status: "saved", effectiveFrom: "next_turn" },
    });
    expect(event.arguments).toMatchObject({ action, contentLength: 6 });
    expect(event.result).toMatchObject({ action, status: "saved", contentLength: 6 });
    expect(JSON.stringify(event)).not.toContain("私人规则正文");
  }
});
