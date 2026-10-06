import { requestJson } from "./request-json";

const endpoint = "/api/local-agent";

export interface AgentSkill {
  name: string;
  description: string;
  instructions: string;
  path: string;
}

/** 读取 `.everything/skills` 中的全部有效 Skill。 */
export function loadSkills(): Promise<{ skills: AgentSkill[] }> {
  return requestJson(`${endpoint}/skills`);
}

/** 新建、编辑或重命名一个 Skill。 */
export function saveSkill(value: {
  originalName?: string;
  name: string;
  description: string;
  instructions: string;
}): Promise<{ ok: true; skill: AgentSkill }> {
  return requestJson(`${endpoint}/skills`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

/** 永久删除 Skill 目录及其中的配套资源。 */
export function deleteSkill(name: string): Promise<{ ok: true }> {
  return requestJson(`${endpoint}/skills`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
}
