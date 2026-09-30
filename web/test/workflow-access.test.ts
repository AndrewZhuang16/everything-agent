import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { Graph, START, END, node } from "../../src/engine/src/index.ts";
import { createLocalApi } from "../server/local-api.ts";

vi.mock("../server/agent-service.ts", () => ({ AgentConfigError: class extends Error {} }));
vi.mock("../server/evaluation-service.ts", () => ({}));
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => { for (const clean of cleanup.splice(0).reverse()) await clean(); });

it.each([true, false])("工作流编辑权限=%s，读取和运行始终可用，写入受服务端限制", async (editable) => {
  const directory = await mkdtemp(join(tmpdir(), "workflow-access-"));
  cleanup.push(() => rm(directory, { recursive: true, force: true }));
  const file = editable ? "example.ts" : "example.js";
  await writeFile(join(directory, file), "原始代码");
  const graph = new Graph("测试工作流").addNode(node("回复", () => ({ reply: "完成" })))
    .addEdge(START, "回复").addEdge("回复", END);
  const loadWorkflow = vi.fn(async () => ({ graph }));
  const handler = createLocalApi({ workflowDirectory: directory, workflowEditable: editable, loadWorkflow });
  const server = createServer((req, res) => { void handler(req, res, () => res.end()); });
  cleanup.push(async () => {
    if (!server.listening) return;
    const closed = new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  });
  // 监听失败必须立即拒绝，不能等 Vitest 超时后遗留未处理的 error 事件。
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { server.removeListener("error", reject); resolve(); });
  });
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/api/local-workflow`;
  const loaded = await (await fetch(url)).json();
  expect(loaded).toMatchObject({ editable, files: [file], selectedFile: file, source: "原始代码", workflow: { name: "测试工作流" } });
  const saved = await fetch(url, { method: "PUT", body: JSON.stringify({ file, source: "修改代码" }) });
  expect(saved.status).toBe(editable ? 200 : 403);
  expect(await readFile(join(directory, file), "utf8")).toBe(editable ? "修改代码" : "原始代码");
  const run = await fetch(`${url}/run`, { method: "POST", body: JSON.stringify({ file }) });
  const events = (await run.text()).trim().split("\n").map((line) => JSON.parse(line));
  expect(events.at(-1)).toMatchObject({ type: "result", result: { status: "completed", state: { reply: "完成" } } });
  expect(events.some((event) => event.kind === "node_end")).toBe(true);
  expect(loadWorkflow).toHaveBeenCalledWith(join(directory, file));
});
