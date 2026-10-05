import type { ToolEventProjection } from "./types.ts";
import type { ToolCallRecord } from "../agent-loop/agent-loop.ts";

/** 根据工具提供的安全投影封装公开事件，并递归移除凭证；缺省投影隐藏正文。 */
export function publicToolEvent(call: ToolCallRecord, projection: ToolEventProjection = privateProjection): Record<string, unknown> {
  const result = call.isError
    ? (projection.error ?? redact)(call.result)
    : projection.result(call.result);
  return {
    tool: call.tool,
    toolCallId: call.toolUseId,
    iteration: call.iteration,
    isError: call.isError,
    arguments: removeCredentials(projection.arguments(call.args)),
    result: removeCredentials(result),
    outputLength: call.output.length,
    summary: call.isError ? "工具执行失败" : "工具执行完成",
  };
}

function skillToolMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { redacted: true };
  const result = value as Record<string, unknown>;
  return {
    name: result.name,
    description: result.description,
    instructionLength: typeof result.instructions === "string" ? result.instructions.length : 0,
  };
}

/** 终端执行只保留命令与边界信息；完整输出留在工具结果里，不灌进事件流。 */
function terminalToolMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { redacted: true };
  const result = value as Record<string, unknown>;
  return {
    command: result.command,
    workdir: result.workdir,
    exitCode: result.exitCode,
    truncated: result.truncated,
    timedOut: result.timedOut,
    denialHint: result.denialHint,
    sandbox: result.sandbox,
    approved: result.approved ?? false,
    networkAllowed: result.networkAllowed ?? false,
    stdoutLength: typeof result.stdout === "string" ? result.stdout.length : 0,
    stderrLength: typeof result.stderr === "string" ? result.stderr.length : 0,
  };
}

function memoryToolMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return { count: value.length, ids: value.map((item) => item?.id).filter((id) => typeof id === "number") };
  if (!value || typeof value !== "object") return { redacted: true };
  const item = value as Record<string, unknown>;
  return Object.fromEntries(["action", "intent", "status", "taskId", "reasonCode", "targetId", "deletedIds"].filter((key) => item[key] !== undefined).map((key) => [key, item[key]]));
}

function sessionRecallToolMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const result = value as Record<string, unknown>;
  if (Array.isArray(result.sessions)) {
    return {
      retrievalMode: result.retrievalMode,
      requestedLimit: result.requestedLimit,
      returnedSessionCount: result.returnedSessionCount,
      droppedSessionCount: result.droppedSessionCount,
      truncated: result.truncated,
      sessions: result.sessions.map((item) => {
        const sessionResult = item as Record<string, unknown>;
        const session = sessionResult.session as Record<string, unknown> | undefined;
        return {
          sessionId: session?.id,
          rank: sessionResult.rank,
          match: sessionResult.match,
          retrievalSignals: sessionResult.retrievalSignals,
          returnedMessageCount: sessionResult.returnedMessageCount,
          returnedRanges: sessionResult.returnedRanges,
          isComplete: sessionResult.isComplete,
          truncated: sessionResult.truncated,
        };
      }),
    };
  }
  const session = result.session as Record<string, unknown> | undefined;
  return {
    sessionId: session?.id,
    totalMessageCount: result.totalMessageCount,
    returnedMessageCount: result.returnedMessageCount,
    returnedRanges: result.returnedRanges,
    isComplete: result.isComplete,
    truncated: result.truncated,
  };
}

function removeCredentials(value: unknown, key = ""): unknown {
  const normalizedKey = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  if (/(?:^|_)(?:api_key|authorization|cookie|token|access_token|refresh_token|auth_token|secret|client_secret|password)(?:$|_)/.test(normalizedKey)) {
    return "[凭证已移除]";
  }
  if (Array.isArray(value)) return value.map((item) => removeCredentials(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([itemKey, itemValue]) => [itemKey, removeCredentials(itemValue, itemKey)]));
}

function calendarMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object") return { redacted: true };
  const result = value as Record<string, unknown>;
  return { source: result.source, status: result.status, approved: result.approved };
}

function everythingMetadata(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { redacted: true };
  const item = value as Record<string, unknown>;
  return { action: item.action, status: item.status, contentLength: typeof item.content === "string" ? item.content.length : item.contentLength, effectiveFrom: item.effectiveFrom };
}


const redact = () => ({ redacted: true });
const privateProjection: ToolEventProjection = { arguments: redact, result: redact };

/** 内置工具的安全展示策略；装配时绑定到工具，Runtime 不识别工具名称。 */
export function builtinToolEventProjection(name: string): ToolEventProjection {
  const result = name === "manage_everything" ? everythingMetadata
    : name === "manage_calendar" ? calendarMetadata
    : name === "read_skill" ? skillToolMetadata
    : name === "session_search" || name === "session_read" ? sessionRecallToolMetadata
    : name === "run_terminal" ? terminalToolMetadata
    : name === "manage_memory" ? memoryToolMetadata : removeCredentials;
  const args = name === "manage_everything" ? everythingMetadata
    : name === "manage_calendar" ? redact
    : name === "manage_memory" ? memoryToolMetadata : removeCredentials;
  return { arguments: args, result, error: removeCredentials };
}
