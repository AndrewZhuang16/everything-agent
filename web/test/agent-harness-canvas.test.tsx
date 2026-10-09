import { I18nProvider } from "@lingui/react";
import { i18n } from "../src/i18n";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { agentHarnessGraph, harnessPresentation, harnessEdgeLabels, describeHarnessRetrieval } from "../../src/agent-graph/harness-graph.ts";
import { AgentHarnessCanvas } from "../src/pages/agent/AgentHarnessCanvas";

afterEach(() => i18n.activate("zh"));

function workflow() {
  const graph = agentHarnessGraph.describe();
  return { name: graph.name, nodes: graph.nodes.map((node) => ({ id: node.name, label: harnessPresentation[node.name]!.title, kind: node.kind, maxVisits: node.maxVisits, presentation: harnessPresentation[node.name]! })), edges: graph.edges.map((edge) => ({ ...edge, label: harnessEdgeLabels[`${edge.source}->${edge.target}`]! })) };
}

it("英文模式翻译全部可见边标签，保留拓扑与执行状态", () => {
  const graph = workflow();
  const render = () => renderToStaticMarkup(<I18nProvider i18n={i18n}><AgentHarnessCanvas workflow={graph} nodeStates={{ retrieval_gate: "running" }} activeEdges={new Set(["user_prompt->retrieval_gate"])} /></I18nProvider>);
  i18n.activate("en");
  const english = render();
  const edgeTexts = [...english.matchAll(/class="harness-edge-label">([^<]*)<\/text>/g)].map(match => match[1]);
  expect(edgeTexts.length).toBeGreaterThan(0);
  for (const label of edgeTexts) expect(label).not.toMatch(/\p{Script=Han}/u);
  expect(edgeTexts).toContain("Current question");
  expect(edgeTexts).toContain("Last 3 completed turns");
  expect(english).toContain('agent-edge active');
  expect(english).toContain('agent-node running');
  // 切换只改变显示文案，不改写 Graph 提供的标签。
  expect(graph.edges.some(edge => edge.label === "当前问题")).toBe(true);
  i18n.activate("zh");
  expect(render()).toContain("当前问题");
});

describe("Agent 业务画布", () => {
  it("从 Graph 渲染所有业务节点和边说明，隐藏边界且不额外拼接输入", () => {
    const graph = workflow();
    const html = renderToStaticMarkup(<I18nProvider i18n={i18n}><AgentHarnessCanvas workflow={graph} nodeStates={{ retrieval_gate: "running" }} activeEdges={new Set(["user_prompt->retrieval_gate"])} /></I18nProvider>);
    for (const node of graph.nodes) expect(html.split(`data-node="${node.id}"`)).toHaveLength(2);
    for (const edge of graph.edges.filter((edge) => edge.source !== "START" && edge.target !== "END")) {
      expect(edge.label).toBeTruthy();
      expect(html).toContain(edge.label);
      expect(html.split(`data-edge="${edge.source}-&gt;${edge.target}"`)).toHaveLength(2);
    }
    expect(html).not.toContain('data-node="START"');
    expect(html).not.toContain('data-node="END"');
    expect(html).not.toContain("Client Chat History");
    expect(html).not.toContain("Session Chat History");
    expect(html).toContain("Current Session");
    expect(html).toContain("当前会话");
    expect(html).toContain("最近 3 个已完成回合");
    expect(html).toContain("摘要与后续工作记忆");
    expect(html).toContain("EVERYTHING.md");
    expect(html).toContain("Skills Catalog");
    expect(html).toContain("Procedural Memory");
    expect(html).toContain("Tool Schemas");
    expect(html).toContain("System Prompt");
    for (const subtitle of ["用户输入", "用户常驻规则", "Instructions + available skills", "Names &amp; descriptions", "assembled per turn"]) {
      expect(html).toContain(subtitle);
    }
    expect(html).not.toContain("Context budget");
    expect(html).toContain("后台写入 · 独立串行队列，不阻塞回复");
    expect(html).toContain("Memory Retrieval &amp; Agent Loop");
    expect(html).toContain("记忆任务入队");
    expect(html).toContain("Consolidation / Dreaming");
    expect(html).not.toContain("Background Memory");
    expect(html).not.toContain("Memory Queue");
    expect(html).toContain('agent-node running');
    expect(html).toContain('agent-edge active');

  });
  it("服务端移除节点时不在前端恢复固定节点", () => {
    const graph = workflow();
    graph.nodes = graph.nodes.filter((node) => node.id !== "user_prompt");
    const html = renderToStaticMarkup(<I18nProvider i18n={i18n}><AgentHarnessCanvas workflow={graph} nodeStates={{}} activeEdges={new Set()} /></I18nProvider>);
    expect(html).not.toContain('data-node="user_prompt"');
    expect(html).not.toContain('data-edge="user_prompt');
  });
});

it.each(["lexical_only", "dense_only", "hybrid"] as const)("流程图按 %s 标明事实召回，历史对话保持 FTS", (mode) => {
  const graph = workflow();
  const presentation = describeHarnessRetrieval(mode);
  graph.nodes = graph.nodes.map((node) => ({ ...node, presentation: presentation[node.id]! }));
  const html = renderToStaticMarkup(<I18nProvider i18n={i18n}><AgentHarnessCanvas workflow={graph} nodeStates={{}} activeEdges={new Set()} /></I18nProvider>);
  expect(html).toContain("FTS5 + BM25 · 排除当前会话");
  expect(html.includes("Hybrid · RRF + MMR")).toBe(mode === "hybrid");
  expect(html).not.toContain("BM25 + Dense → RRF 融合 → MMR 去重");
  expect(html.includes("Dense · 相似度过滤")).toBe(mode === "dense_only");
});

it("画布精简标题、说明、缩放和记忆提交文案", () => {
  const html = renderToStaticMarkup(<I18nProvider i18n={i18n}><AgentHarnessCanvas workflow={workflow()} nodeStates={{}} activeEdges={new Set()} /></I18nProvider>);
  for (const text of ["Agent Graph · 业务流程", "拓扑来自", "连线表示", "缩小流程图", "放大流程图", "事务提交 / 跳过", "检索旧记忆并判断"]) expect(html).not.toContain(text);
  expect(html).toContain("检索旧semantic memory");
  expect(html).toContain("事务提交");
});
