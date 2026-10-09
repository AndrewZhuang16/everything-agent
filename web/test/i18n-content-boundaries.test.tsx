// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider } from "@lingui/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { i18n } from "../src/i18n";
import { LanguageSwitcher } from "../src/components/LanguageSwitcher";
import { SkillsPage } from "../src/pages/skills/SkillsPage";
import { ToolsPage } from "../src/pages/tools/ToolsPage";

vi.mock("../src/apis/skills-api", () => ({
  loadSkills: vi.fn(async () => ({ skills: [{ name: "sample-skill", description: "原始 Skill 描述", instructions: "原始 Skill 指令", path: ".everything/skills/sample-skill/SKILL.md" }] })),
  saveSkill: vi.fn(), deleteSkill: vi.fn(),
}));
vi.mock("../src/apis/tools-api", () => ({
  loadTools: vi.fn(async () => ({
    tools: [{ name: "sample_tool", description: "原始工具 schema 描述", origin: "内置", enabled: true, configured: true, configurable: false }],
    tavily: { keyConfigured: false }, terminal: { workspaceRoot: null },
  })), saveTools: vi.fn(),
}));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it("Tools 页面翻译界面与分组说明，保留工具 schema 描述", async () => {
  await act(async () => root.render(<I18nProvider i18n={i18n}><LanguageSwitcher /><ToolsPage /></I18nProvider>));
  expect(host.textContent).toContain("内置工具");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Built-in tools");
  expect(host.textContent).toContain("Provided by the Runtime with no external services.");
  expect(host.textContent).toContain("原始工具 schema 描述");
  expect(host.querySelector('[aria-label="Always enabled"]')).not.toBeNull();
  expect(host.textContent).toContain("Fixed built-in capability");
});
it("Skills 页面翻译操作文案并保留描述、指令和未保存内容", async () => {
  await act(async () => root.render(<I18nProvider i18n={i18n}><LanguageSwitcher /><SkillsPage /></I18nProvider>));
  const description = [...host.querySelectorAll("input")].find(input => input.value === "原始 Skill 描述")!;
  const instructions = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(instructions, "尚未保存的中文指令");
    instructions.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Save Skill");
  expect(host.textContent).toContain("Unsaved changes");
  expect(host.querySelector("textarea")).toBe(instructions);
  expect(instructions.value).toBe("尚未保存的中文指令");
  expect(description.value).toBe("原始 Skill 描述");
});
