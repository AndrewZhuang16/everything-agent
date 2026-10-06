import { afterEach, expect, it, vi } from "vitest";
import { requestJson, responseError } from "../src/apis/request-json";
import { evaluationRequest } from "../src/apis/evaluation-api";
import { saveSystemPrompt } from "../src/apis/config-api";
import { runAgent } from "../src/apis/agent-api";
import { loadLocalWorkflow } from "../src/apis/workflow-api";

afterEach(() => vi.unstubAllGlobals());

it("JSON 请求透传请求参数和返回值", async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const init = { method: "POST", signal: new AbortController().signal };
  await expect(requestJson("/api/test", init)).resolves.toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith("/api/test", init);
});

it("各 API 和流式请求保留服务端错误与强制保存标记", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
    Response.json({ error: "需要确认", canForce: true }, { status: 409 })));
  for (const request of [
    () => saveSystemPrompt("提示"),
    () => loadLocalWorkflow(),
    () => evaluationRequest(),
    () => runAgent("你好", "session", vi.fn(), new AbortController().signal),
  ]) {
    await expect(request()).rejects.toMatchObject({ message: "需要确认", canForce: true });
  }
});

it.each([
  ['{"error":"失败","canForce":false}', "失败", false],
  ['{"error":""}', '{"error":""}', undefined],
  ["网关不可用", "网关不可用", undefined],
  ["", "请求失败（503）", undefined],
  ["null", "null", undefined],
])("错误响应 %s 回退到可展示的信息", async (body, message, canForce) => {
  const error = await responseError(new Response(body, { status: 503 }));
  expect(error.message).toBe(message);
  expect(error.canForce).toBe(canForce);
});

it("网络错误和成功响应的 JSON 解析错误不会被吞掉", async () => {
  const error = new Error("连接中断");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(error)
    .mockResolvedValueOnce(new Response("不是 JSON")));
  await expect(requestJson("/api/test")).rejects.toBe(error);
  await expect(requestJson("/api/test")).rejects.toBeInstanceOf(SyntaxError);
});

it("评估 API 区分读取和提交请求", async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  await evaluationRequest();
  await evaluationRequest("/run", { dataset: "示例" });
  expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/evaluation", undefined);
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/evaluation/run", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataset: "示例" }),
  });
});
