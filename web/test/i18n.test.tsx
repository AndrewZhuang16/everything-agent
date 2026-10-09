// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nProvider, useLingui } from "@lingui/react";
import { msg, t } from "@lingui/core/macro";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { activateLocale, detectLocale, formatLocale, i18n, translateMessage } from "../src/i18n";
import { translatePresentation } from "../src/presentation-i18n";
import { LanguageSwitcher } from "../src/components/LanguageSwitcher";
import { ApprovalPrompt } from "../src/pages/agent/ApprovalPrompt";
import { CompactionNotice } from "../src/pages/agent/CompactionNotice";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
function browserLanguage(language: string) {
  Object.defineProperty(navigator, "languages", { configurable: true, value: [language] });
}

it.each(["zh", "zh-CN", "zh-TW", "ZH-HK"])("中文浏览器 %s 默认使用中文", (language) => {
  browserLanguage(language);
  expect(detectLocale()).toBe("zh");
});
it.each(["en-US", "ja-JP", "fr", "zhx"])("非中文浏览器 %s 默认使用英文", (language) => {
  browserLanguage(language);
  expect(detectLocale()).toBe("en");
});
it("浏览器只提供 language 时仍能检测语言，无效保存值回退到浏览器", () => {
  Object.defineProperty(navigator, "languages", { configurable: true, value: [] });
  Object.defineProperty(navigator, "language", { configurable: true, value: "zh-CN" });
  window.localStorage.setItem("everything-agent.locale", "invalid");
  expect(detectLocale()).toBe("zh");
});
it("已保存的手动选择优先于浏览器语言，并同步文档语言和区域格式", () => {
  browserLanguage("zh-CN");
  activateLocale("en");
  expect(detectLocale()).toBe("en");
  expect(document.documentElement.lang).toBe("en");
  expect(formatLocale()).toBe("en-US");
  activateLocale("zh");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(formatLocale()).toBe("zh-CN");
});
it("存储不可用时语言切换和浏览器检测仍正常工作", () => {
  browserLanguage("ja");
  vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("禁止读取"); });
  vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("禁止写入"); });
  expect(detectLocale()).toBe("en");
  expect(() => activateLocale("en")).not.toThrow();
  expect(i18n.locale).toBe("en");
});

function EditablePanel() {
  useLingui();
  const [draft, setDraft] = useState("尚未保存的原文");
  return <><LanguageSwitcher /><label>{t`消息内容`}<input value={draft} onChange={event => setDraft(event.target.value)} /></label></>;
}
it("点击切换按钮即时更新文案并保留同一表单节点和草稿", async () => {
  await act(async () => root.render(<I18nProvider i18n={i18n}><EditablePanel /></I18nProvider>));
  const input = host.querySelector("input")!;
  expect(host.textContent).toContain("消息内容");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("Message content");
  expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("Switch language");
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("尚未保存的原文");
  expect(detectLocale()).toBe("en");
  await act(async () => host.querySelector("button")!.click());
  expect(host.textContent).toContain("消息内容");
});
it("延迟提示和预设画布标签跟随当前语言，原始内容保持不变", () => {
  const pending = msg`正在整理`;
  expect(translateMessage(pending)).toBe("正在整理");
  activateLocale("en", false);
  expect(translateMessage(pending)).toBe("Consolidating");
  expect(translatePresentation("校验并提交")).toBe("Validate and commit");
  expect(translatePresentation("用户自己的工作流名称")).toBe("用户自己的工作流名称");
  expect(translatePresentation(undefined)).toBe("");
  expect(translateMessage("原始错误：私人内容")).toBe("原始错误：私人内容");
});
it("审批按钮和压缩统计可翻译，命令及服务端审批原因保留原文", async () => {
  activateLocale("en", false);
  await act(async () => root.render(<I18nProvider i18n={i18n}>
    <ApprovalPrompt approvals={[{ id: "approval", kind: "terminal", reason: "原始审批原因", command: "echo '原始命令'", detail: "原始详情" }]} busyId="" onDecide={vi.fn()} />
    <CompactionNotice item={{ compactionId: "compact", status: "done", beforeTokens: 1234, afterTokens: 400 }} />
  </I18nProvider>));
  expect(host.textContent).toContain("Allow once");
  expect(host.textContent).toContain("Reject");
  expect(host.textContent).toContain("原始审批原因");
  expect(host.textContent).toContain("echo '原始命令'");
  expect(host.textContent).toContain("Context compacted");
  expect(host.textContent).toContain("1,234 tokens");
});
