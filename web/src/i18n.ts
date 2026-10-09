import { i18n, type MessageDescriptor } from "@lingui/core";
import { messages as chinese } from "./locales/zh/messages.po";
import { messages as english } from "./locales/en/messages.po";

export type Locale = "zh" | "en";
const preferenceKey = "everything-agent.locale";
i18n.load({ zh: chinese, en: english });
// 独立组件和非浏览器调用默认使用中文，应用入口再解析用户偏好。
i18n.activate("zh");

/** 优先使用已保存的选择，否则跟随浏览器首选语言；非中文统一使用英文。 */
export function detectLocale(): Locale {
  try {
    const saved = window.localStorage.getItem(preferenceKey);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // 本地存储被禁用时仍允许选择语言。
  }
  return /^zh(?:-|$)/i.test(navigator.languages?.[0] || navigator.language) ? "zh" : "en";
}

/** 即时切换界面语言；存储失败不影响当前会话和运行。 */
export function activateLocale(locale: Locale, persist = true): void {
  i18n.activate(locale);
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  if (persist) {
    try { window.localStorage.setItem(preferenceKey, locale); } catch {
      // 浏览器不允许持久化时仅在本次打开期间生效。
    }
  }
}

/** 为日期和数字格式提供与界面一致的区域设置。 */
export function formatLocale(): string {
  return i18n.locale === "zh" ? "zh-CN" : "en-US";
}

export { i18n };

/** 本地界面反馈延迟到展示时翻译；服务端原始错误始终原样展示。 */
export type UiMessage = string | MessageDescriptor;
/** 解析本地翻译描述符；字符串作为原始数据保留。 */
export function translateMessage(message: UiMessage): string {
  return typeof message === "string" ? message : i18n._(message);
}
