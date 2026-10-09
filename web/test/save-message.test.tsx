import { I18nProvider } from "@lingui/react";
import { i18n } from "../src/i18n";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SaveMessage } from "../src/components/SaveMessage";

const componentPath = fileURLToPath(new URL("../src/components/SaveMessage.tsx", import.meta.url));

describe("保存成功消息", () => {
  it("以可访问的状态消息展示成功反馈", () => {
    const html = renderToStaticMarkup(<I18nProvider i18n={i18n}><SaveMessage message="已刷新" setMessage={vi.fn()} /></I18nProvider>);

    expect(html).toContain('class="save-message"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("已刷新");
  });

  it("无消息时不渲染，并由组件统一管理自动清除", async () => {
    expect(renderToStaticMarkup(<I18nProvider i18n={i18n}><SaveMessage message="" setMessage={vi.fn()} /></I18nProvider>)).toBe("");

    const source = await readFile(componentPath, "utf8");
    expect(source).toContain('window.setTimeout(() => setMessage(""), 2_500)');
    expect(source).toContain("window.clearTimeout(timeout)");
  });
});
