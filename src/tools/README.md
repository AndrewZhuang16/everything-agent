# Tools

`everything-agent/tools` 是工具模块的公开入口。工具模块不依赖 `agent-runtime`；宿主通过能力接口注入配置存储、常驻规则、Memory、Skills 和审批通道。

## 注册与装配

`LocalToolRegistry` 接收 `LocalTool[]`，只负责按名称查找、拒绝重名、取消检查、schema 列举和公开事件投影。空注册表没有内置工具。`schemas()` 按注册顺序返回独立快照；未知工具报错，执行异常交给 Agent Loop 转换为失败结果和事件。

每个 `LocalTool` 提供 `schema`、`execute(args, notify, context)`，可选提供 `eventProjection`。参数校验、依赖调用、外部写操作确认和审计由工具实现负责。`context` 带有取消信号、截止时间、迭代和调用身份；工具应在开始操作前检查取消与截止时间。内部事件使用传入的 `notify`，并保留调用身份。

```ts
import { LocalToolRegistry } from "everything-agent/tools";

const tools = new LocalToolRegistry([{
  schema: {
    name: "lookup_status",
    description: "读取任务状态",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  execute(args, _notify, context) {
    context.signal?.throwIfAborted();
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) {
      throw new TypeError("lookup_status 不接受参数");
    }
    return { status: "ready" };
  },
  eventProjection: {
    arguments: () => ({}),
    result: () => ({ status: "ready" }),
  },
}]);
```

`createBuiltinTools(context)` 集中装配现有内置工具，绑定执行函数与安全投影。它根据配置、平台和实际依赖决定是否注册；终端未配置工作区或沙箱不可用时不注册终端，不会降级为无保护执行；其他构造错误直接抛出。工厂只返回注册表，界面中的沙箱可用性原因由配置目录提供。Memory、Session Recall 与 Skills 依赖缺省时，相应工具不注册；时间工具默认启用。

配置管理仍使用现有工具开关和凭证字段。`createToolSettings(store)` 只依赖 `ToolConfigStore` 的读取、普通配置写入和凭证写入能力；`ManageEverythingTool` 只依赖 `EverythingRuleStore` 的常驻规则读写能力。持久化实现由宿主提供，不通过 Runtime 类型定义接口。

## Runtime 注入

`createAgentRuntime(paths, { toolFactory })` 接收同步或异步 `ToolFactory`，默认使用 `createBuiltinTools`。工厂返回 `ToolCollection`，包含 Loop 的 schema/执行接口和 `publicToolEvent(call)`。Runtime 不构造具体工具、不分发具体工具名称，也不解析工具凭证。

执行与 `contextUsage()` 都通过该工厂装配。上下文预览不执行工具、不提供当前用户证据或活动审批通道；实际回合提供可信记忆证据与审批通道。工厂应在两条路径公开一致的工具 schema，并保持构造可重复，避免在装配时执行业务写操作。当前没有自定义工具的前端配置目录协议；宿主注入工具后，前端配置仍需单独接入。

## 事件与隐私

Registry 将注册项的 `eventProjection` 用于参数、成功结果与失败结果的安全展示，保留现有工具事件名称、身份、迭代、输出长度和相对顺序。`arguments`、`result` 返回可序列化元数据；`error` 可选，省略时隐藏错误正文。

未提供投影的工具及未知工具，默认以 `{ redacted: true }` 隐藏参数与结果。通用事件封装还递归移除凭证字段。内置工具投影在工具模块中维护：记忆、常驻规则、日历与 Skill 正文只保留元数据；终端输出只保留长度及状态；内置工具失败仍保留既有错误信息并移除凭证字段。该投影只约束工具事件，模型请求快照及工具返回给模型的内容沿用现有追踪策略。

新增普通工具需要增加实现与行为测试，并在 tools 内装配入口登记执行和安全投影。需要启停、凭证或专用界面时，更新工具配置与前端；不需要修改 Runtime 调度或 Runtime 事件名称分支。
