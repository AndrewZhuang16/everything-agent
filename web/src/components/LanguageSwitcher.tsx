import { Globe } from "lucide-react";
import { useLingui } from "@lingui/react";
import { t } from "@lingui/core/macro";
import { activateLocale } from "../i18n";
import { Button } from "./ui/button";

/** 切换全局界面语言，不重新挂载页面或重置正在运行的会话。 */
export function LanguageSwitcher() {
  const { i18n } = useLingui();
  // 悬浮提示与目标语言一致，无障碍标签仍跟随当前界面语言。
  const title = i18n.locale === "zh" ? "Switch language" : "切换语言";
  return <Button variant="secondary" size="sm" aria-label={t`切换语言`} title={title}
    onClick={() => activateLocale(i18n.locale === "zh" ? "en" : "zh")}>
    <Globe size={14} aria-hidden="true" />
    <span lang={i18n.locale === "zh" ? "en" : "zh-CN"}>{i18n.locale === "zh" ? "English" : "中文"}</span>
  </Button>;
}
