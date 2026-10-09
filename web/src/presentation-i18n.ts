import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { i18n } from "./i18n";

// 仅映射产品预设的展示文案；未知工作流标签、工具 schema 和用户内容保留原文。
const labels: Record<string, MessageDescriptor> = {
  "用户输入": msg`用户输入`,
  "当前会话": msg`当前会话`,
  "用户常驻规则": msg`用户常驻规则`,
  "系统提示词": msg`系统提示词`,
  "小模型 · 代码验证检索意图": msg`小模型 · 代码验证检索意图`,
  "可用工具与参数": msg`可用工具与参数`,
  "70% 触发 · 30% 软目标": msg`70% 触发 · 30% 软目标`,
  "理解需求 · 决定下一步": msg`理解需求 · 决定下一步`,
  "受控调用 · 参数验证": msg`受控调用 · 参数验证`,
  "流式输出": msg`流式输出`,
  "记忆任务入队": msg`记忆任务入队`,
  "manage_memory · 返回任务 ID": msg`manage_memory · 返回任务 ID`,
  "每日首次使用 / 手动触发": msg`每日首次使用 / 手动触发`,
  "全量事实与分批": msg`全量事实与分批`,
  "Semantic Facts · 上下文预算": msg`Semantic Facts · 上下文预算`,
  "模型整理": msg`模型整理`,
  "去重 / 合并 / 冲突 / 清理": msg`去重 / 合并 / 冲突 / 清理`,
  "校验并提交": msg`校验并提交`,
  "版本检查 · 直接替换旧事实": msg`版本检查 · 直接替换旧事实`,
  "整理结果": msg`整理结果`,
  "批次进度 / 冲突 / 错误": msg`批次进度 / 冲突 / 错误`,
  "检索旧semantic memory": msg`检索旧semantic memory`,
  "模型 · 合并 / 更新 / 忘记": msg`模型 · 合并 / 更新 / 忘记`,
  "校验并保存": msg`校验并保存`,
  "证据与版本校验 · 审计": msg`证据与版本校验 · 审计`,
  "新增 / 更新 / 删除 / 合并 / 跳过": msg`新增 / 更新 / 删除 / 合并 / 跳过`,
  "FTS5 + BM25 · 排除当前会话": msg`FTS5 + BM25 · 排除当前会话`,
  "仅 macOS；首次使用需要系统自动化权限，每次写入需要确认": msg`仅 macOS；首次使用需要系统自动化权限，每次写入需要确认`,
  "工作区根目录": msg`工作区根目录`,
  "Dense · 相似度过滤": msg`Dense · 相似度过滤`,
  "内置": msg`内置`,
};

/** 将已知的服务端展示标签映射为当前界面语言，保留原始拓扑和数据。 */
export function translatePresentation(value: string | undefined): string {
  if (!value) return "";
  return labels[value] ? i18n._(labels[value]) : value;
}
