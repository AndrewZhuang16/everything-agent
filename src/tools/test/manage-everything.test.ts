import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createBuiltinTools } from "../index.ts";
import { createLocalConfig } from "../../agent-runtime/local-config.ts";

const homes: string[] = [];
afterEach(async () => { await Promise.all(homes.splice(0).map(home => rm(home, { recursive: true, force: true }))); });
const context = () => ({ signal: new AbortController().signal, deadline: null, iteration: 1, toolUseId: "rules-1" });
async function setup() {
  const home = await mkdtemp(join(tmpdir(), "everything-rules-")); homes.push(home);
  const config = createLocalConfig({ home, defaultSystemPromptPath: join(home, "template.md") });
  return { home, config, registry: createBuiltinTools({ options: { everythingConfig: config } }) };
}
it("注册工具并读写与配置页共享的常驻规则", async () => {
  const { home, config, registry } = await setup();
  expect(registry.schemas()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "manage_everything" })]));
  expect(await registry.execute("manage_everything", { action: "read" }, () => {}, context())).toMatchObject({ action: "read", content: expect.stringContaining("行为约束") });
  expect(await registry.execute("manage_everything", { action: "write", content: "# 新规则\n\n使用中文。\n" }, () => {}, context())).toMatchObject({ status: "saved", effectiveFrom: "next_turn" });
  expect(await config.readSystemPrompt()).toBe("# 新规则\n\n使用中文。\n");
  expect(await readFile(join(home, "EVERYTHING.md"), "utf8")).toBe(await config.readSystemPrompt());
  await config.saveSystemPrompt("配置页更新");
  expect(await registry.execute("manage_everything", { action: "read" }, () => {}, context())).toMatchObject({ content: "配置页更新\n" });
});
it.each([null, [], {}, { action: "delete" }, { action: "read", content: "意外正文" }, { action: "read", path: "其他文件" }, { action: "write" }, { action: "write", content: 1 }, { action: "write", content: " " }, { action: "write", content: "x".repeat(100001) }])("拒绝非法参数且保留原规则：%j", async args => {
  const { config, registry } = await setup(); await config.saveSystemPrompt("原规则");
  await expect(registry.execute("manage_everything", args, () => {}, context())).rejects.toThrow(TypeError);
  expect(await config.readSystemPrompt()).toBe("原规则\n");
});
it("取消和超时不写入规则", async () => {
  const { config, registry } = await setup(); await config.saveSystemPrompt("原规则");
  const controller = new AbortController(); controller.abort(new Error("已取消"));
  expect(() => registry.execute("manage_everything", { action: "write", content: "新规则" }, () => {}, { ...context(), signal: controller.signal })).toThrow("已取消");
  await expect(registry.execute("manage_everything", { action: "write", content: "新规则" }, () => {}, { ...context(), deadline: 0 })).rejects.toThrow("超时");
  expect(await config.readSystemPrompt()).toBe("原规则\n");
});
it("未注入规则配置时不注册工具", () => {
  const registry = createBuiltinTools();
  expect(() => registry.execute("manage_everything", { action: "read" }, () => {}, context())).toThrow("工具未注册");
});
