import { formatLocale } from "../i18n";
import { useLingui } from "@lingui/react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { ContextUsage } from "../apis/agent-api";
import { readContextGauge } from "../pages/agent/context-gauge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

const SIZE = 18;
const STROKE = 2;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * 输入框旁的上下文水位圆环。
 * 分子分母与 Agent Loop 的 Context Window 硬限制一致；额度不可用时整体不渲染，
 * 不显示 0%。
 */
export function ContextGauge({ usage }: { usage: ContextUsage | null }) {
  useLingui();
  const reading = readContextGauge(usage);
  if (!reading) return null;
  const label = t`上下文占用 ${reading.percent}%`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`context-gauge level-${reading.level}`}
            role="progressbar"
            tabIndex={0}
            aria-label={label}
            aria-valuenow={reading.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={label}
          >
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
              <circle
                className="context-gauge-track"
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
              />
              <circle
                className="context-gauge-arc"
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                strokeWidth={STROKE}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - reading.arcRatio)}
              />
            </svg>
          </span>
        </TooltipTrigger>
        <TooltipContent className="grid gap-0.5 border border-border bg-popover text-popover-foreground" side="top" align="center" role="tooltip">
          <span className="font-semibold"><Trans>上下文窗口：</Trans></span>
          <span><Trans>{reading.percent}% 已用（剩余 {Math.max(0, 100 - reading.percent)}%）</Trans></span>
          <span><Trans>已用 {new Intl.NumberFormat(formatLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(reading.usedTokens).toLowerCase()} 标记，共 {new Intl.NumberFormat(formatLocale(), { notation: "compact", maximumFractionDigits: 1 }).format(reading.availableTokens).toLowerCase()}</Trans></span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
