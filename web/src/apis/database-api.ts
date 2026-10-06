import { requestJson } from "./request-json";

const endpoint = "/api/local-agent";

export interface DatabaseColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  defaultValue: unknown;
}

export interface DatabaseTable {
  name: string;
  count: number;
  columns: DatabaseColumn[];
  rows: unknown[][];
}

export interface DatabaseDashboard {
  path: string;
  size: number;
  tables: DatabaseTable[];
}

export interface DatabaseQueryResult {
  kind: "read" | "write";
  columns: string[];
  rows: unknown[][];
  truncated: boolean;
  changes: number;
  lastInsertRowid: number | string | null;
}

/** 读取 state.db 中排除索引中间表后的普通表。 */
export function loadDatabase(): Promise<DatabaseDashboard> {
  return requestJson(`${endpoint}/database`);
}

/** 执行 SQL；数据写操作仅在页面完成二次确认后携带确认令牌。 */
export function runDatabaseSql(sql: string, confirmed = false): Promise<DatabaseQueryResult> {
  return requestJson(`${endpoint}/database/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql, confirmation: confirmed ? "CONFIRM_DATABASE_WRITE" : undefined }),
  });
}

/** 判断页面是否需要在提交 SQL 前展示写操作确认框。 */
export function databaseSqlNeedsConfirmation(sql: string): boolean {
  const statement = sql.replace(/^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "").toLowerCase();
  return /^(insert|update|delete)\b/.test(statement);
}
