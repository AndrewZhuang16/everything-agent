import { i18n } from "./i18n";
import { I18nProvider, useLingui } from "@lingui/react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { EvaluationPage } from "./pages/evaluation/EvaluationPage";
import { Activity, FlaskConical, Bot, BookOpen, Brain, ChevronLeft, ChevronRight, Database, GitBranch, Settings, Sparkles, Wrench } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "./components/ui/button";
import { AgentPage } from "./pages/agent/AgentPage";
import { ConfigPage } from "./pages/config/ConfigPage";
import { DatabasePage } from "./pages/database/DatabasePage";
import { MemoryPage } from "./pages/memory/MemoryPage";
import { SkillsPage } from "./pages/skills/SkillsPage";
import { ToolsPage } from "./pages/tools/ToolsPage";
import { TracePage } from "./pages/trace/TracePage";
import { WorkflowPage } from "./pages/workflow/WorkflowPage";

type Page = "evaluation" | "agent" | "workflow" | "skills" | "tools" | "memory" | "database" | "traces" | "config";

/** URL 仅接受已知页面；空地址和无效地址默认展示 Agent。 */
function readPage(): Page {
  const value = window.location.hash.slice(2);
  switch (value) {
    case "evaluation": case "agent": case "workflow": case "skills":
    case "tools": case "memory": case "database": case "traces": case "config":
      return window.location.hash.startsWith("#/") ? value : "agent";
    default:
      return "agent";
  }
}

export default function App() {
  return <I18nProvider i18n={i18n}><AppContent /></I18nProvider>;
}

function AppContent() {
  useLingui();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [page, updatePage] = useState<Page>(readPage);

  useEffect(() => {
    const syncPage = () => {
      // 默认入口使用替换导航，避免后退时再次进入空地址。
      if (!window.location.hash) {
        const url = new URL(window.location.href);
        url.hash = "/agent";
        window.history.replaceState(window.history.state, "", url);
      }
      updatePage(readPage());
    };
    window.addEventListener("hashchange", syncPage);
    // 初始化与订阅之间的地址变化也需要同步。
    syncPage();
    return () => window.removeEventListener("hashchange", syncPage);
  }, []);

  const setPage = (nextPage: Page) => {
    window.location.hash = `/${nextPage}`;
    updatePage(nextPage);
  };

  const pageContent = {
    agent: null,
    evaluation: <EvaluationPage />,
    config: <ConfigPage />,
    skills: <SkillsPage />,
    tools: <ToolsPage />,
    memory: <MemoryPage />,
    database: <DatabasePage />,
    traces: <TracePage />,
    workflow: <WorkflowPage />,
  } satisfies Record<Page, ReactNode>;

  return (
    <div className="app-shell">
      <aside id="app-sidebar" className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="brand-row">
          <div className="brand-mark"><Sparkles size={15} /></div>
          <div className="brand-copy"><strong>Everything Agent</strong><span><Trans>可视化Agent控制台</Trans></span></div>
          <Button variant="ghost" size="icon-sm" className="panel-collapse-toggle sidebar-toggle" onClick={() => setSidebarOpen(false)} aria-label={t`收起侧边栏`} aria-expanded={sidebarOpen} aria-controls="app-sidebar"><ChevronLeft size={16} /></Button>
        </div>
        <Button variant="ghost" className={`nav-item ${page === "workflow" ? "active" : ""}`} onClick={() => setPage("workflow")}><GitBranch size={15} /><span>Workflow</span></Button>
        <div className="nav-divider" aria-hidden="true" />
        <Button variant="ghost" className={`nav-item mb-1 ${page === "agent" ? "active" : ""}`} onClick={() => setPage("agent")}><Bot size={15} /><span>Agent</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "skills" ? "active" : ""}`} onClick={() => setPage("skills")}><BookOpen size={15} /><span>Skills</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "tools" ? "active" : ""}`} onClick={() => setPage("tools")}><Wrench size={15} /><span>Tools</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "memory" ? "active" : ""}`} onClick={() => setPage("memory")}><Brain size={15} /><span>Memory</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "database" ? "active" : ""}`} onClick={() => setPage("database")}><Database size={15} /><span>Database</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "traces" ? "active" : ""}`} onClick={() => setPage("traces")}><Activity size={15} /><span>Traces</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "evaluation" ? "active" : ""}`} onClick={() => setPage("evaluation")}><FlaskConical size={15} /><span>Evaluation</span></Button>
        <Button variant="ghost" className={`nav-item mb-1 ${page === "config" ? "active" : ""}`} onClick={() => setPage("config")}><Settings size={15} /><span><Trans>配置</Trans></span></Button>
        <div className="sidebar-note"><Trans><span className="signal bg-emerald-500" />本地 Engine 已连接</Trans></div>
      </aside>
      {!sidebarOpen && <Button variant="ghost" size="icon-sm" className="panel-collapse-toggle sidebar-reopen" onClick={() => setSidebarOpen(true)} aria-label={t`展开侧边栏`} aria-expanded={sidebarOpen} aria-controls="app-sidebar"><ChevronRight size={16} /></Button>}

      {/* 页面导航只隐藏 Agent，保留运行请求、事件订阅和会话状态。 */}
      <main className="main-content agent-main-content" hidden={page !== "agent"}>
        <AgentPage active={page === "agent"} onOpenConfig={() => setPage("config")} />
      </main>
      {page !== "agent" && <main className="main-content">{pageContent[page]}</main>}
    </div>
  );
}
