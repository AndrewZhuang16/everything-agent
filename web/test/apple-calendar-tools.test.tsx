// @vitest-environment happy-dom
import { I18nProvider } from "@lingui/react";
import { i18n } from "../src/i18n";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ToolsPage } from "../src/pages/tools/ToolsPage";
import { loadTools, saveTools, type ToolsCatalog } from "../src/apis/tools-api";
vi.mock("../src/apis/tools-api", () => ({ loadTools: vi.fn(), saveTools: vi.fn() }));
vi.mock("../src/lib/minimum-duration", () => ({ withMinimumDuration: (task: () => unknown) => task() }));
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
it.each([false, true])("日历开关独立保存，失败时保持原状态：%s", async (failure) => {
  const catalog: ToolsCatalog = {
    tools: [{ name: "manage_calendar", description: "查询、创建或修改日程", origin: "Apple Calendar", enabled: false, configured: true, configurable: true }],
    tavily: { keyConfigured: false, keyLast4: "" }, terminal: { sandboxKind: null, unavailableReason: null, workspaceRoot: "" },
  };
  vi.mocked(loadTools).mockResolvedValue(catalog);
  vi.mocked(saveTools).mockReset();
  if (failure) vi.mocked(saveTools).mockRejectedValue(new Error("保存失败"));
  else vi.mocked(saveTools).mockResolvedValue({ ...catalog, ok: true, tools: [{ ...catalog.tools[0]!, enabled: true }] });
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<I18nProvider i18n={i18n}><ToolsPage /></I18nProvider>));
    await act(async () => (host.querySelector('[role="switch"]') as HTMLButtonElement).click());
    expect(saveTools).toHaveBeenCalledWith(expect.objectContaining({ appleCalendarEnabled: true, getCurrentTimeEnabled: true, searchWebEnabled: false }));
    expect(host.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe(String(!failure));
    if (failure) expect(host.textContent).toContain("保存失败");
  } finally { await act(async () => root.unmount()); host.remove(); }
});
