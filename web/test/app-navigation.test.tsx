// @vitest-environment happy-dom
import { I18nProvider } from "@lingui/react";
import { i18n } from "../src/i18n";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
vi.mock("../src/pages/agent/AgentPage", () => ({ AgentPage: () => <div>AgentPage</div> }));
vi.mock("../src/pages/config/ConfigPage", () => ({ ConfigPage: () => <div>ConfigPage</div> }));
vi.mock("../src/pages/database/DatabasePage", () => ({ DatabasePage: () => <div>DatabasePage</div> }));
vi.mock("../src/pages/memory/MemoryPage", () => ({ MemoryPage: () => <div>MemoryPage</div> }));
vi.mock("../src/pages/skills/SkillsPage", () => ({ SkillsPage: () => <div>SkillsPage</div> }));
vi.mock("../src/pages/tools/ToolsPage", () => ({ ToolsPage: () => <div>ToolsPage</div> }));
vi.mock("../src/pages/trace/TracePage", () => ({ TracePage: () => <div>TracePage</div> }));
vi.mock("../src/pages/workflow/WorkflowPage", () => ({ WorkflowPage: () => <div>WorkflowPage</div> }));
vi.mock("../src/pages/evaluation/EvaluationPage", () => ({ EvaluationPage: () => <div>EvaluationPage</div> }));

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.history.replaceState(null, "", "/");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
});
const activePage = () => host.querySelector(".nav-item.active")?.textContent;

it("从当前 URL 恢复页面，刷新后仍停留在该页面", async () => {
  window.history.replaceState(null, "", "/#/memory");
  await act(async () => root.render(<I18nProvider i18n={i18n}><App /></I18nProvider>));
  expect(activePage()).toBe("Memory");
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider i18n={i18n}><App /></I18nProvider>));
  expect(activePage()).toBe("Memory");
});

it("导航同步 URL，响应历史导航，并保持 Agent 挂载", async () => {
  await act(async () => root.render(<I18nProvider i18n={i18n}><App /></I18nProvider>));
  const agent = host.querySelector(".agent-main-content");
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Tools")!.click());
  expect(window.location.hash).toBe("#/tools");
  expect(activePage()).toBe("Tools");
  expect(host.querySelector(".agent-main-content")).toBe(agent);
  await act(async () => {
    window.history.replaceState(null, "", "/#/config");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(activePage()).toBe("配置");
});

it.each(["", "#/unknown"])("空地址或未知页面 %s 回到 Agent", async (hash) => {
  window.history.replaceState(null, "", "/" + hash);
  await act(async () => root.render(<I18nProvider i18n={i18n}><App /></I18nProvider>));
  expect(activePage()).toBe("Agent");
});

it("根地址替换为 Agent 地址，保留查询参数且不增加历史记录", async () => {
  window.history.replaceState({ source: "entry" }, "", "/?mode=local");
  const historyLength = window.history.length;
  await act(async () => root.render(<I18nProvider i18n={i18n}><App /></I18nProvider>));
  expect(window.location.hash).toBe("#/agent");
  expect(window.location.search).toBe("?mode=local");
  expect(window.history.length).toBe(historyLength);
  expect(window.history.state).toEqual({ source: "entry" });
  expect(activePage()).toBe("Agent");
});
