import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, it } from "vitest";

it("使用原清单和 pnpm 锁文件冻结安装目标平台依赖，发布包无需 npm 锁文件", () => {
  const root = mkdtempSync(join(tmpdir(), "package-test-"));
  try {
    for (const directory of ["scripts", "docs", "dist-web", "dist-server/web/server", "bin"]) mkdirSync(join(root, directory), { recursive: true });
    cpSync(resolve("scripts/package.mjs"), join(root, "scripts/package.mjs"));
    const manifest = { name: "fixture", version: "1.0.0", engines: { node: ">=24.12" }, dependencies: { fixture: "^1.0.0" }, devDependencies: { development: "^1.0.0" } };
    const lock = "lockfileVersion: '9.0'\n# 完整锁定图\n";
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(root, "pnpm-lock.yaml"), lock);
    writeFileSync(join(root, "docs/production.md"), "npm start");
    writeFileSync(join(root, "dist-web/index.html"), "前端");
    writeFileSync(join(root, "dist-server/web/server/prod-server.js"), "后端");
    const executable = join(root, "bin/pnpm");
    writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs');
const path = require('node:path');
fs.writeFileSync(${JSON.stringify(join(root, "installation.json"))}, JSON.stringify({ args: process.argv.slice(2), manifest: JSON.parse(fs.readFileSync('package.json', 'utf8')), lock: fs.readFileSync('pnpm-lock.yaml', 'utf8'), cwd: process.cwd() }));
fs.mkdirSync('node_modules/fixture', { recursive: true });
fs.writeFileSync('node_modules/fixture/package.json', JSON.stringify({ version: '1.0.0' }));\n`);
    chmodSync(executable, 0o755);
    const npm = join(root, "bin/npm");
    writeFileSync(npm, `#!${process.execPath}\nprocess.exit(99);\n`);
    chmodSync(npm, 0o755);
    execFileSync(process.execPath, [join(root, "scripts/package.mjs"), "--platform", "win32", "--arch", "x64"], { env: { ...process.env, PATH: `${join(root, "bin")}:${process.env.PATH}` } });
    const installation = JSON.parse(readFileSync(join(root, "installation.json"), "utf8"));
    expect(installation.manifest).toEqual(manifest);
    expect(installation.lock).toBe(lock);
    expect(installation.args).toEqual(expect.arrayContaining(["install", "--prod", "--frozen-lockfile", "--os=win32", "--cpu=x64"]));
    expect(existsSync(installation.cwd)).toBe(false);
    const output = join(root, "release/everything-agent-win32-x64");
    expect(JSON.parse(readFileSync(join(output, "package.json"), "utf8")).scripts.start).toBe("node dist-server/web/server/prod-server.js");
    expect(JSON.parse(readFileSync(join(output, "node_modules/fixture/package.json"), "utf8")).version).toBe("1.0.0");
    expect(existsSync(join(output, "package-lock.json"))).toBe(false);
    expect(existsSync(join(output, "pnpm-lock.yaml"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("清单与锁文件不一致时拒绝打包，不重新解析依赖版本", () => {
  const root = mkdtempSync(join(tmpdir(), "package-mismatch-test-"));
  try {
    for (const directory of ["scripts", "docs", "dist-web", "dist-server/web/server"]) mkdirSync(join(root, directory), { recursive: true });
    cpSync(resolve("scripts/package.mjs"), join(root, "scripts/package.mjs"));
    cpSync(resolve("pnpm-lock.yaml"), join(root, "pnpm-lock.yaml"));
    const manifest = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
    manifest.dependencies["@langfuse/client"] = "99.0.0";
    writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
    writeFileSync(join(root, "docs/production.md"), "npm start");
    writeFileSync(join(root, "dist-web/index.html"), "前端");
    writeFileSync(join(root, "dist-server/web/server/prod-server.js"), "后端");
    const result = spawnSync(process.execPath, [join(root, "scripts/package.mjs")], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("ERR_PNPM_OUTDATED_LOCKFILE");
    const output = join(root, `release/everything-agent-${process.platform}-${process.arch}`);
    expect(existsSync(join(output, "node_modules"))).toBe(false);
    expect(existsSync(join(output, "package-lock.json"))).toBe(false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
