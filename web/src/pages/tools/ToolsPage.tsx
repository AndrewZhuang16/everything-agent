import { translatePresentation } from "../../presentation-i18n";
import { translateMessage, type UiMessage } from "../../i18n";
import { useLingui } from "@lingui/react";
import { msg, t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { AlertMessage } from "../../components/AlertMessage";
import { CheckCircle2, Clock3, Info, KeyRound, LockKeyhole, Search, Terminal, Wrench } from "lucide-react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadTools, saveTools, type AgentTool, type ToolsCatalog } from "../../apis/tools-api";
import { withMinimumDuration } from "../../lib/minimum-duration";
import { PageHeading } from "../../components/PageHeading";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "../../components/ui/alert-dialog";

/** 展示 Agent 的真实工具目录，并管理允许用户修改的工具开关与凭证。 */
export function ToolsPage() {
  const { i18n } = useLingui();
  const [catalog, setCatalog] = useState<ToolsCatalog | null>(null);
  const [getCurrentTimeEnabled, setGetCurrentTimeEnabled] = useState(true);
  const [searchWebEnabled, setSearchWebEnabled] = useState(false);
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [tavilyDialogOpen, setTavilyDialogOpen] = useState(false);
  const [terminalEnabled, setTerminalEnabled] = useState(false);
  const [terminalDialogOpen, setTerminalDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savingTools, setSavingTools] = useState<Set<string>>(new Set());
  const saving = savingTools.has("search_web");
  const savedCatalog = useRef<ToolsCatalog | null>(null);
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [message, setMessage] = useState<UiMessage>("");
  const [error, setError] = useState("");

  useEffect(() => { void reload(); }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(""), 2_500);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const groups = useMemo(() => {
    const tools = catalog?.tools ?? [];
    return [
      { id: "builtin", name: t`内置工具`, description: t`随 Runtime 提供，不依赖外部服务。`, tools: tools.filter((tool) => tool.origin === "内置") },
      { id: "external", name: t`外部集成`, description: t`连接外部服务和本机应用；日历写入需要确认。`, tools: tools.filter((tool) => tool.origin !== "内置") },
    ];
  }, [catalog, i18n.locale]);

  async function reload() {
    setLoading(true);
    setError("");
    try {
      applyCatalog(await loadTools());
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  function applyCatalog(next: ToolsCatalog) {
    savedCatalog.current = next;
    setCatalog(next);
    setGetCurrentTimeEnabled(next.tools.find((tool) => tool.name === "get_current_time")?.enabled ?? true);
    setSearchWebEnabled(next.tools.find((tool) => tool.name === "search_web")?.enabled ?? false);
    setTavilyApiKey("");
    setTerminalEnabled(next.tools.find((tool) => tool.name === "run_terminal")?.enabled ?? false);
  }

  async function persist({
    nextGetCurrentTimeEnabled,
    nextSearchWebEnabled,
    nextAppleCalendarEnabled,
    nextTerminalEnabled,
    clearTavilyApiKey = false,
    closeDialog = false,
    closeTerminalDialog = false,
  }: {
    nextGetCurrentTimeEnabled?: boolean;
    nextSearchWebEnabled?: boolean;
    nextAppleCalendarEnabled?: boolean;
    nextTerminalEnabled?: boolean;
    clearTavilyApiKey?: boolean;
    closeDialog?: boolean;
    closeTerminalDialog?: boolean;
  } = {}): Promise<boolean> {
    const terminalChange = nextTerminalEnabled !== undefined || closeTerminalDialog;
    const toolName = nextAppleCalendarEnabled !== undefined ? "manage_calendar" : terminalChange
      ? "run_terminal"
      : nextGetCurrentTimeEnabled !== undefined ? "get_current_time" : "search_web";
    setSavingTools((current) => new Set(current).add(toolName));
    const previousSave = saveQueue.current;
    let release!: () => void;
    saveQueue.current = new Promise<void>((resolve) => { release = resolve; });
    setMessage("");
    setError("");
    try {
      // 接口保存完整配置：排队后读取最近成功结果，避免不同开关覆盖彼此。
      await previousSave;
      const current = savedCatalog.current;
      const next = await withMinimumDuration(() =>
        saveTools({
          getCurrentTimeEnabled: nextGetCurrentTimeEnabled ?? current?.tools.find((tool) => tool.name === "get_current_time")?.enabled ?? true,
          searchWebEnabled: clearTavilyApiKey ? false : nextSearchWebEnabled ?? (closeDialog ? searchWebEnabled : current?.tools.find((tool) => tool.name === "search_web")?.enabled ?? false),
          tavilyApiKey: toolName === "search_web" ? tavilyApiKey : "",
          clearTavilyApiKey,
          appleCalendarEnabled: nextAppleCalendarEnabled,
          terminalEnabled: nextTerminalEnabled ?? (terminalChange ? terminalEnabled : undefined),
        }),
      );
      savedCatalog.current = next;
      setCatalog(next);
      // 仅同步本次操作的工具，保留另一个开关尚未完成的用户操作。
      if (toolName === "run_terminal") {
        setTerminalEnabled(next.tools.find((tool) => tool.name === toolName)?.enabled ?? false);
      } else if (toolName === "get_current_time") {
        setGetCurrentTimeEnabled(next.tools.find((tool) => tool.name === toolName)?.enabled ?? true);
      } else if (toolName === "search_web") {
        setSearchWebEnabled(next.tools.find((tool) => tool.name === toolName)?.enabled ?? false);
        setTavilyApiKey("");
      }
      setMessage(clearTavilyApiKey ? msg`Tavily API Key 已清除，search_web 已停用。` : msg`工具配置已保存，下一回合立即生效。`);
      if (closeDialog) setTavilyDialogOpen(false);
      if (closeTerminalDialog) setTerminalDialogOpen(false);
      return true;
    } catch (reason) {
      setError(errorMessage(reason));
      return false;
    } finally {
      setSavingTools((current) => {
        const next = new Set(current);
        next.delete(toolName);
        return next;
      });
      release();
    }
  }

  async function handleGetCurrentTimeToggle(enabled: boolean) {
    const previous = getCurrentTimeEnabled;
    setGetCurrentTimeEnabled(enabled);
    if (!await persist({ nextGetCurrentTimeEnabled: enabled })) setGetCurrentTimeEnabled(previous);
  }

  async function handleSearchWebToggle(enabled: boolean) {
    const previous = searchWebEnabled;
    setSearchWebEnabled(enabled);
    if (enabled && !catalog?.tavily.keyConfigured) {
      setTavilyDialogOpen(true);
      return;
    }
    if (!await persist({ nextSearchWebEnabled: enabled })) setSearchWebEnabled(previous);
  }

  async function handleTerminalToggle(enabled: boolean) {
    const previous = terminalEnabled;
    setTerminalEnabled(enabled);
    // 沙箱不可用或工作区尚未配置时，先说明去哪里配置，不直接失败。
    if (enabled && (!catalog?.terminal.workspaceRoot || catalog?.terminal.unavailableReason)) {
      setTerminalDialogOpen(true);
      return;
    }
    if (!await persist({ nextTerminalEnabled: enabled })) setTerminalEnabled(previous);
  }

  function handleTerminalDialogOpenChange(open: boolean) {
    setTerminalDialogOpen(open);
    if (!open) {
      setTerminalEnabled(catalog?.tools.find((tool) => tool.name === "run_terminal")?.enabled ?? false);
    }
  }

  function handleTavilyDialogOpenChange(open: boolean) {
    setTavilyDialogOpen(open);
    if (!open) {
      setTavilyApiKey("");
      if (!catalog?.tavily.keyConfigured) {
        setSearchWebEnabled(catalog?.tools.find((tool) => tool.name === "search_web")?.enabled ?? false);
      }
    }
  }

  function effectiveTool(tool: AgentTool): AgentTool {
    if (tool.name === "get_current_time") return { ...tool, enabled: getCurrentTimeEnabled };
    if (tool.name === "search_web") return { ...tool, enabled: searchWebEnabled, configured: Boolean(tavilyApiKey || catalog?.tavily.keyConfigured) };
    if (tool.name === "run_terminal") {
      return {
        ...tool,
        enabled: terminalEnabled,
        configured: Boolean(catalog?.terminal.workspaceRoot) && !catalog?.terminal.unavailableReason,
      };
    }
    return tool;
  }

  return <div className="content-wrap [&_code]:font-mono [&_code]:text-[.92em]">
    <PageHeading eyebrow={t`Agent 能力 / 受控执行`} title="Tools" description={t`查看 Agent 当前可用的工具，并配置允许修改的能力。`} />
    <div className="intro-note"><Wrench size={16} /><p><Trans><strong>工具注册表是运行时事实来源。</strong> 固定内置工具始终可用；开关保存在 <code>.everything/config.json</code>，Tavily 凭证保存在 <code>.everything/.env</code>，密钥不会返回浏览器。</Trans></p></div>
    {message && <div className="tools-toast" role="status" aria-live="polite"><CheckCircle2 size={15} />{translateMessage(message)}</div>}
    <AlertMessage message={error} />
    {loading ? <div className="grid min-h-60 place-items-center rounded-panel border border-border bg-card text-xs text-muted-foreground shadow-card"><Trans>正在读取工具目录…</Trans></div> : <>
      {groups.map((group) => <section className="mt-[22px]" key={group.id}>
        <div className="mb-2.5 flex items-end justify-between gap-4"><div><h2 className="m-0 text-[15px]">{group.name}</h2><p className="mt-1 text-caption text-muted-foreground">{group.description}</p></div><Badge variant="outline">{group.tools.length} tools</Badge></div>
        <ToolsGrid>
          {group.tools.map((rawTool) => {
            const tool = effectiveTool(rawTool);
            return <ToolCard
              key={tool.name}
              tool={tool}
              disabled={savingTools.has(tool.name)}
              onToggle={tool.name === "manage_calendar"
                ? (enabled) => { void persist({ nextAppleCalendarEnabled: enabled }); }
                : tool.name === "get_current_time"
                ? handleGetCurrentTimeToggle
                : tool.name === "search_web"
                  ? handleSearchWebToggle
                  : tool.name === "run_terminal" ? handleTerminalToggle : undefined}
              onConfigure={tool.name === "search_web"
                ? () => setTavilyDialogOpen(true)
                : tool.name === "run_terminal" ? () => setTerminalDialogOpen(true) : undefined}
            />;
          })}
        </ToolsGrid>
      </section>)}
      <AlertDialog open={terminalDialogOpen} onOpenChange={handleTerminalDialogOpenChange}>
        <AlertDialogContent className="gap-5 max-h-[calc(100dvh-32px)] overflow-y-auto [&_code]:font-mono [&_code]:text-[.92em]">
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>终端执行</Trans></AlertDialogTitle>
            <AlertDialogDescription><Trans>
              <code>run_terminal</code> 的执行边界由 Sandbox 配置决定，需要先设置工作区根目录。
            </Trans></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid min-w-0 gap-5 text-sm leading-[1.65]">
            {catalog?.terminal.unavailableReason
              ? <Alert variant="warning">
                  <Info />
                  <AlertDescription><Trans>
                    当前环境无法建立沙箱：{catalog.terminal.unavailableReason}
                  </Trans></AlertDescription>
                </Alert>
              : <div className="text-muted-foreground [&_p]:m-0 [&_p+p]:mt-2.5 [&_strong]:font-medium [&_strong]:text-foreground">
                  <p><Trans>请到<strong>配置页面的 Sandbox 区域</strong>填写工作区根目录，保存后回到这里启用。</Trans></p>
                  <p><Trans>命令只能写入该工作区，其中的 <code>.git</code> 与 <code>.everything</code> 不可写，出站网络默认切断。</Trans></p>
                </div>}
            <dl className="m-0 grid gap-3 border-t border-border pt-4 text-body [&>div]:grid [&>div]:grid-cols-[5em_minmax(0,1fr)] [&>div]:items-baseline [&>div]:gap-4 [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-foreground [&_dd]:[overflow-wrap:anywhere]">
              <div>
                <dt><Trans>当前工作区</Trans></dt>
                <dd><code>{catalog?.terminal.workspaceRoot || t`未配置`}</code></dd>
              </div>
              <div>
                <dt><Trans>沙箱</Trans></dt>
                <dd>{catalog?.terminal.sandboxKind || t`未配置`}</dd>
              </div>
            </dl>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}><Trans>关闭</Trans></AlertDialogCancel>
            <Button
              loading={saving}
              disabled={!catalog?.terminal.workspaceRoot || Boolean(catalog?.terminal.unavailableReason)}
              onClick={() => void persist({ nextTerminalEnabled: true, closeTerminalDialog: true })}
            ><Trans>
              启用
            </Trans></Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={tavilyDialogOpen} onOpenChange={handleTavilyDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle><Trans>Tavily 配置</Trans></AlertDialogTitle>
            <AlertDialogDescription><Trans>为 <code>search_web</code> 配置只读网页搜索凭证，密钥只会保存在本机。</Trans></AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3.5 [@media(max-width:760px)]:grid-cols-1 [@media(max-width:760px)]:items-stretch">
            <label className="config-field"><span className="config-field-label">Tavily API Key</span><Input type="password" value={tavilyApiKey} onChange={(event) => setTavilyApiKey(event.target.value)} placeholder={catalog?.tavily.keyConfigured ? t`已配置 ····${catalog.tavily.keyLast4}` : "tvly-…"} autoComplete="off" spellCheck={false} /><span className="field-help"><KeyRound size={13} /><Trans>留空会保留已保存的密钥。</Trans></span></label>
            <div className="flex items-center gap-3 pb-px [&_a]:text-caption [&_a]:text-primary [&_a]:no-underline [&_a:hover]:underline"><a href="https://app.tavily.com" target="_blank" rel="noreferrer"><Trans>获取 API Key</Trans></a>{catalog?.tavily.keyConfigured && <Button variant="destructive-outline" size="sm" disabled={saving} onClick={() => void persist({ clearTavilyApiKey: true, closeDialog: true })}><Trans>清除密钥</Trans></Button>}</div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}><Trans>取消</Trans></AlertDialogCancel>
            <Button loading={saving} onClick={() => void persist({ closeDialog: true })}><Trans>保存 Tavily 配置</Trans></Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </div>;
}

function ToolCard({ tool, disabled = false, onToggle, onConfigure }: { tool: AgentTool; disabled?: boolean; onToggle?: (enabled: boolean) => void; onConfigure?: () => void }) {
  useLingui();
  return <Card className={`w-full min-w-0 transition-[border-color,opacity] duration-150 ${tool.enabled ? "" : "opacity-[.68]"}`}>
    <CardHeader className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-[17px] pt-4 pb-3">
      <div className="grid size-[34px] place-items-center rounded-control bg-accent text-primary">{tool.name === "get_current_time" ? <Clock3 size={17} /> : tool.name === "search_web" ? <Search size={17} /> : tool.name === "run_terminal" ? <Terminal size={17} /> : <Wrench size={17} />}</div>
      <div><CardTitle className="text-body"><code>{tool.name}</code></CardTitle><CardDescription className="mt-1.5 text-caption leading-[1.55]">{tool.description}</CardDescription></div>
      {tool.configurable
        ? <button className="group relative mt-1.5 h-[19px] w-[34px] rounded-full border-0 bg-input p-0 transition-colors duration-150 enabled:aria-checked:bg-primary disabled:bg-button-disabled" type="button" role="switch" aria-checked={tool.enabled} aria-label={`${tool.name} ${tool.enabled ? t`已启用` : t`已停用`}`} disabled={disabled} onClick={() => onToggle?.(!tool.enabled)}><span className="absolute top-[3px] left-[3px] size-[13px] rounded-full bg-card shadow-[0_1px_3px_rgb(0_0_0/.2)] transition-transform duration-150 group-aria-checked:translate-x-[15px]" /></button>
        : !tool.enabled ? <span><Trans>仅 macOS</Trans></span> : <LockKeyhole className="mt-[7px] mr-[3px] text-muted-foreground" size={15} aria-label={t`固定启用`} />}
    </CardHeader>
    <CardContent className="flex items-center justify-between gap-3 border-t border-border px-[17px] pt-2.5 pb-3 [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1 [&>span]:text-[10px] [&>span]:text-muted-foreground"><Badge variant={tool.enabled ? "success" : "outline"}>{tool.enabled ? t`已启用` : t`已停用`}</Badge>{onConfigure ? <button type="button" className="inline-flex items-center gap-1 border-0 bg-transparent p-0 text-primary hover:underline" aria-label={t`配置 ${tool.name}`} onClick={onConfigure}><span className="inline-flex items-center gap-1 text-[10px]">{tool.configured && <CheckCircle2 size={12} />}{tool.configured ? t`配置就绪` : t`需要配置`}</span></button> : <span>{tool.origin === "Apple Calendar" ? translatePresentation(tool.configurationLabel) : tool.configurable ? tool.configured ? <><CheckCircle2 size={12} /><Trans> 配置就绪</Trans></> : t`需要配置` : translatePresentation(tool.configurationLabel) || t`固定内置能力`}</span>}</CardContent>
  </Card>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 保持 DOM 从左到右的工具顺序，用实际高度计算网格占位。 */
function ToolsGrid({ children }: { children: ReactNode }) {
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cards = [...grid.children] as HTMLElement[];
    const updateLayout = () => {
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").length;
      const nextRows = Array<number>(columns).fill(1);
      cards.forEach((card, index) => {
        const column = index % columns;
        const span = Math.ceil(card.getBoundingClientRect().height) + 12;
        card.style.gridColumn = String(column + 1);
        card.style.gridRow = `${nextRows[column]} / span ${span}`;
        nextRows[column]! += span;
      });
    };
    const observer = new ResizeObserver(updateLayout);
    observer.observe(grid);
    cards.forEach((card) => observer.observe(card));
    updateLayout();
    return () => observer.disconnect();
  }, [children]);
  return <div className="grid grid-cols-2 auto-rows-[1px] items-start gap-x-3 [@media(max-width:760px)]:grid-cols-1" ref={gridRef}>{children}</div>;
}
