import { Storage } from "happy-dom";
import { beforeEach } from "vitest";
import { activateLocale } from "../src/i18n";

beforeEach(() => {
  if (typeof document === "undefined") return;
  // Node.js 26 的原生 localStorage 无文件参数时为 undefined，使用测试 DOM 的存储。
  Object.defineProperty(window, "localStorage", { configurable: true, value: new Storage() });
  Object.defineProperty(navigator, "languages", { configurable: true, value: ["zh-CN"] });
  window.localStorage.removeItem("everything-agent.locale");
  activateLocale("zh", false);
});
