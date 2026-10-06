/** 请求 JSON；HTTP 错误保留服务端错误信息和强制保存标记，网络及解析错误直接抛出。 */
export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

/** 解析普通请求和流式请求的失败响应，非 JSON 响应回退到文本或状态码。 */
export async function responseError(response: Response): Promise<Error & { canForce?: boolean }> {
  const text = await response.text();
  let value: { error?: string; canForce?: boolean } | null;
  try {
    value = JSON.parse(text);
  } catch {
    value = null;
  }
  const error: Error & { canForce?: boolean } = new Error(value?.error || text || `请求失败（${response.status}）`);
  if (typeof value?.canForce === "boolean") error.canForce = value.canForce;
  return error;
}
