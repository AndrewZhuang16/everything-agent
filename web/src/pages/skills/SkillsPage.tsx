import { translateMessage, type UiMessage } from "../../i18n";
import { useLingui } from "@lingui/react";
import { msg, t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { AlertMessage } from "../../components/AlertMessage";
import { BookOpen, CheckCircle2, FileCode2, LoaderCircle, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { deleteSkill, loadSkills, saveSkill, type AgentSkill } from "../../apis/skills-api";
import {
  MINIMUM_FEEDBACK_DURATION_MS,
  withMinimumDuration,
} from "../../lib/minimum-duration";
import { PageHeading } from "../../components/PageHeading";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

interface SkillDraft {
  originalName?: string;
  name: string;
  description: string;
  instructions: string;
}

const EMPTY_DRAFT: SkillDraft = { name: "", description: "", instructions: "" };

/** 编辑 Agent Skills，并将变更同步到 `.everything/skills`。 */
export function SkillsPage() {
  useLingui();
  const [skills, setSkills] = useState<AgentSkill[]>([]);
  const [draft, setDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [savedDraft, setSavedDraft] = useState<SkillDraft>(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<UiMessage>("");
  const [messageIsError, setMessageIsError] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(savedDraft), [draft, savedDraft]);
  const isCreating = draft.originalName === undefined;
  const isInitialLoading = loading && skills.length === 0;

  useEffect(() => {
    if (!message || messageIsError) return;
    const timeout = window.setTimeout(() => setMessage(""), 2_500);
    return () => window.clearTimeout(timeout);
  }, [message, messageIsError]);

  const reload = async (preferredName?: string, minimumDurationMs = 0) => {
    setMessage("");
    setMessageIsError(false);
    setLoading(true);
    try {
      const result = await withMinimumDuration(loadSkills, minimumDurationMs);
      setSkills(result.skills);
      const selected = result.skills.find((skill) => skill.name === preferredName)
        ?? result.skills.find((skill) => skill.name === draft.originalName)
        ?? result.skills[0];
      const next = selected ? toDraft(selected) : EMPTY_DRAFT;
      setDraft(next);
      setSavedDraft(next);
    } catch (error) {
      setMessage(errorMessage(error));
      setMessageIsError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  function select(skill: AgentSkill) {
    if (dirty && !window.confirm(t`当前修改尚未保存，确认放弃修改？`)) return;
    const next = toDraft(skill);
    setDraft(next);
    setSavedDraft(next);
    setMessage("");
    setMessageIsError(false);
  }

  function create() {
    if (loading) return;
    if (dirty && !window.confirm(t`当前修改尚未保存，确认放弃修改？`)) return;
    setDraft(EMPTY_DRAFT);
    setSavedDraft(EMPTY_DRAFT);
    setMessage("");
    setMessageIsError(false);
    requestAnimationFrame(() => nameInputRef.current?.focus());
  }

  async function refresh() {
    if (loading) return;
    if (dirty && !window.confirm(t`当前修改尚未保存，确认从本地重新读取？`)) return;
    setRefreshing(true);
    try {
      await reload(undefined, MINIMUM_FEEDBACK_DURATION_MS);
    } finally {
      setRefreshing(false);
    }
  }

  async function persist() {
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await withMinimumDuration(async () => {
        const result = await saveSkill(draft);
        await reload(result.skill.name);
        setMessage(msg`${result.skill.path} 已保存，下一轮 Agent 立即生效。`);
      });
    } catch (error) {
      setMessage(errorMessage(error));
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft.originalName) return;
    setSaving(true);
    setMessage("");
    setMessageIsError(false);
    try {
      await withMinimumDuration(async () => {
        await deleteSkill(draft.originalName!);
        await reload();
        setMessage(msg`Skill 已删除。`);
      });
    } catch (error) {
      setMessage(errorMessage(error));
      setMessageIsError(true);
    } finally {
      setSaving(false);
    }
  }

  return <div className="content-wrap skills-page">
    <PageHeading eyebrow={t`Agent 能力 / 按需加载`} title="Skills" description={t`管理 Agent 可发现并按需读取的本地技能。`} descriptionActions={<Button size="sm" disabled={saving} onClick={create}><Plus size={14} /><Trans> 新建 Skill</Trans></Button>} />
    <div className="intro-note"><BookOpen size={16} /><p><Trans><strong>Skill 文件是唯一事实来源。</strong> 页面直接读写 <code>.everything/skills/&lt;skill-name&gt;/SKILL.md</code>；Agent 只接收名称和描述，决定使用后通过 <code>read_skill</code> 读取完整指令。</Trans></p></div>
    {message && (messageIsError
      ? <AlertMessage message={message} />
      : <div className="skills-message" role="status" aria-live="polite"><CheckCircle2 size={15} />{translateMessage(message)}</div>)}
    <div className="skills-layout">
      <aside className="panel skills-list-panel">
        <div className="panel-header skills-list-header">
          <div><span><Trans>本地 Skills</Trans></span><small>{loading ? t`正在同步` : t`${skills.length} 个`}</small></div>
          <Button className="skills-refresh" variant="ghost" size="sm" aria-label={t`重新读取 Skills`} loading={refreshing} disabled={saving} onClick={() => void refresh()}>
            <RefreshCw size={14} /><span><Trans>刷新</Trans></span>
          </Button>
        </div>
        <div className={`skills-list ${loading ? "is-loading" : ""}`} aria-busy={loading}>
          {loading && skills.length === 0 && <div className="skills-empty"><LoaderCircle className="animate-spin" size={18} /><span><Trans>正在读取本地 Skills…</Trans></span></div>}
          {!loading && skills.length === 0 && !isCreating && <div className="skills-empty"><Trans>还没有 Skill。点击“新建 Skill”开始。</Trans></div>}
          {skills.map((skill) => <button type="button" key={skill.name} className={`skill-list-item ${draft.originalName === skill.name ? "active" : ""}`} aria-current={draft.originalName === skill.name ? "true" : undefined} onClick={() => select(skill)}>
            <FileCode2 size={15} /><span><strong>{skill.name}</strong><small>{skill.description}</small></span>
          </button>)}
          {isCreating && !loading && <div className="skill-list-item skill-list-item-draft active" aria-current="true"><Sparkles size={15} /><span><strong><Trans>未保存的新 Skill</Trans></strong><small><Trans>填写右侧内容并保存到本地</Trans></small></span></div>}
        </div>
      </aside>

      <section className="panel skill-editor-panel" data-mode={isInitialLoading ? "loading" : isCreating ? "create" : "edit"}>
        <div className="panel-header skill-editor-header">
          <div><span>{isInitialLoading ? <LoaderCircle className="animate-spin" size={15} /> : isCreating ? <Sparkles size={15} /> : <FileCode2 size={15} />}{isInitialLoading ? t`读取 Skills` : isCreating ? t`创建新 Skill` : draft.originalName}</span><small>{isInitialLoading ? t`正在准备编辑器` : isCreating ? t`新技能草稿` : t`编辑本地文件`}</small></div>
          <code>{isInitialLoading ? ".everything/skills" : draft.name ? `.everything/skills/${draft.name}/SKILL.md` : ".everything/skills/<skill-name>/SKILL.md"}</code>
        </div>
        {isInitialLoading ? <div className="skill-editor-loading"><LoaderCircle className="animate-spin" size={22} /><span><Trans>正在从本地读取 Skill 文件…</Trans></span></div> : <>
          {isCreating && <div className="skill-create-note"><Sparkles size={16} /><div><strong><Trans>定义一个可复用能力</Trans></strong><span><Trans>清晰描述使用时机，并把执行步骤与边界写进 Instructions。</Trans></span></div></div>}
          <div className="skill-editor-fields">
            <label><span>Name</span><Input ref={nameInputRef} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="meeting-prep" spellCheck={false} /><small><Trans>仅限小写英文字母、数字和连字符；修改后会重命名目录。</Trans></small></label>
            <label><span>Description</span><Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t`何时以及为什么使用这个 Skill`} /></label>
            <label className="skill-instructions-field"><span>Instructions</span><Textarea value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} placeholder={t`写下 Agent 使用此 Skill 时必须遵循的步骤、边界和输出要求…`} spellCheck={false} /></label>
          </div>
          <footer className="skill-editor-actions">
            <Button size="sm" disabled={!dirty || !draft.name.trim() || !draft.description.trim() || !draft.instructions.trim()} loading={saving} onClick={() => void persist()}><Save size={14} /><Trans> 保存 Skill</Trans></Button>
            <span className={dirty ? "is-dirty" : ""}>{dirty && <i aria-hidden="true" />}{dirty ? t`有未保存的修改` : draft.originalName ? t`已与本地文件同步` : t`填写完整后即可保存`}</span>
            {draft.originalName && <DeleteSkillDialog name={draft.originalName} disabled={saving} onConfirm={() => void remove()} />}
          </footer>
        </>}
      </section>
    </div>
  </div>;
}

function DeleteSkillDialog({ name, disabled, onConfirm }: { name: string; disabled: boolean; onConfirm(): void }) {
  useLingui();
  return <AlertDialog><AlertDialogTrigger asChild><Button variant="destructive-outline" size="sm" disabled={disabled}><Trash2 size={13} /><Trans> 删除</Trans></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle><Trans>永久删除 {name}？</Trans></AlertDialogTitle><AlertDialogDescription><Trans>整个 <code>.everything/skills/{name}</code> 目录及其中的配套资源都会被删除，此操作无法撤销。</Trans></AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel><Trans>取消</Trans></AlertDialogCancel><AlertDialogAction onClick={onConfirm}><Trans>确认删除</Trans></AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function toDraft(skill: AgentSkill): SkillDraft {
  return { originalName: skill.name, name: skill.name, description: skill.description, instructions: skill.instructions };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
