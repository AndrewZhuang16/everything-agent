// @vitest-environment happy-dom
import { I18nProvider } from "@lingui/react";
import { i18n } from "../src/i18n";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AgentPage } from "../src/pages/agent/AgentPage";

const api = vi.hoisted(() => ({ loadAgent: vi.fn(), loadContextUsage: vi.fn(), memoryAction: vi.fn(), subscribeBackgroundEvents: vi.fn() }));
vi.mock("../src/apis/agent-api", () => api);
vi.mock("../src/apis/memory-api", () => api);
vi.mock("../src/pages/agent/AgentHarnessCanvas", () => ({ AgentHarnessCanvas: () => null }));
let container: HTMLDivElement;
let root: Root;
const openConfig = vi.fn();
const sessions = [{ id: "session-1", title: "已有会话", messageCount: 2 }];

beforeEach(async () => {
  vi.resetAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.loadAgent.mockResolvedValue({
    workflow: { nodes: [], edges: [] }, semanticCount: 0, sessions,
    settings: { agentModel: { keyConfigured: true, model: "测试模型" }, smallModel: { keyConfigured: true } },
  });
  api.loadContextUsage.mockResolvedValue(null);
  api.subscribeBackgroundEvents.mockReturnValue(vi.fn());
  api.memoryAction.mockImplementation(async ({ action }) => action === "select_session" ? {
    sessions, messages: [
      { turnId: "turn-1", kind: "user_message", content: "保留的问题" },
      { turnId: "turn-1", kind: "assistant_message", content: "保留的回答" },
    ],
  } : action === "consolidate" ? { status: "skipped", reason: "no_semantic_memory" } : null);
  container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(I18nProvider, { i18n }, createElement(AgentPage, { onOpenConfig: openConfig }))));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((item) => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === label);
  expect(found, label).toBeDefined();
  return found!;
}
async function click(label: string) { await act(async () => button(label).click()); }

it("历史对话按钮控制列表显示并同步无障碍展开状态", async () => {
  const toggle = button("展开对话列表");
  const list = document.getElementById(toggle.getAttribute("aria-controls")!)!;
  expect(toggle.disabled).toBe(false);
  expect(toggle.getAttribute("aria-expanded")).toBe("false");
  expect(list.hidden).toBe(true);
  await click("展开对话列表");
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(list.hidden).toBe(false);
  expect(list.textContent).toContain("已有会话");
  await click("收起对话列表");
  expect(list.hidden).toBe(true);
});

it("Escape 收起历史列表并将焦点交还入口", async () => {
  await click("展开对话列表");
  const list = document.getElementById("agent-session-rail")!;
  await act(async () => list.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(list.hidden).toBe(true);
  expect(document.activeElement).toBe(button("展开对话列表"));
});

it("收起聊天区保留消息与草稿，并关闭历史列表", async () => {
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "未发送草稿");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("展开对话列表");
  await click("收起聊天区");
  expect(document.getElementById("agent-chat-content")!.hidden).toBe(true);
  expect(document.getElementById("agent-session-rail")!.hidden).toBe(true);
  expect(button("展开聊天区").getAttribute("aria-expanded")).toBe("false");
  await click("展开聊天区");
  expect(document.getElementById("agent-chat-content")!.hidden).toBe(false);
  expect(textarea.value).toBe("未发送草稿");
  expect(container.textContent).toContain("保留的回答");
});

it("模型入口打开配置，进入页面只触发每日整理且空库禁用手动整理", async () => {
  await click("测试模型");
  expect(openConfig).toHaveBeenCalledTimes(1);
  expect(api.memoryAction.mock.calls.filter(([input]) => input.action === "consolidate")).toEqual([[{ action: "consolidate", trigger: "daily" }]]);
  expect(button("Consolidate").disabled).toBe(true);
  expect(container.textContent).toContain("暂无 Semantic Memory，无需整理");
});

it("新建对话在请求未结束时阻止重复提交", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((done) => { resolve = done; });
  api.memoryAction.mockImplementation(({ action }) => action === "create_session" ? pending : Promise.resolve({ sessions, messages: [] }));
  await click("新建对话");
  await click("新建对话");
  expect(api.memoryAction.mock.calls.filter(([input]) => input.action === "create_session")).toHaveLength(1);
  await act(async () => resolve({ session: { id: "session-2", title: "新会话", messageCount: 0 }, sessions: [...sessions, { id: "session-2", title: "新会话", messageCount: 0 }], messages: [] }));
  expect(container.textContent).toContain("新会话");
  expect(container.textContent).not.toContain("保留的回答");
  expect(button("新建对话").disabled).toBe(true);
});
