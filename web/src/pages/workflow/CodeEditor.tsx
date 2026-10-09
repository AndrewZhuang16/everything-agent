import { useLingui } from "@lingui/react";
import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { Check, Code2, RefreshCw } from "lucide-react";
import { useMemo, useRef } from "react";
import { Button } from "../../components/ui/button";

interface CodeEditorProps {
  editable: boolean;
  code: string;
  error: string;
  workflowFiles: string[];
  selectedFile: string;
  switching: boolean;
  refreshing: boolean;
  onChange: (code: string) => void;
  onSelect: (file: string) => void;
  onReset: () => void;
}

export function CodeEditor(props: CodeEditorProps) {
  useLingui();
  const { editable, code, error, workflowFiles, selectedFile, switching, refreshing, onChange, onSelect, onReset } = props;
  const gutterRef = useRef<HTMLDivElement>(null);
  const lineNumbers = useMemo(() => code.split("\n").map((_, index) => index + 1), [code]);

  return (
    <section className="panel overflow-hidden">
      <div className="panel-header">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Code2 size={15} />
          <span><Trans>工作流代码</Trans></span>
          <label className="workflow-picker" title={t`选择工作流`}>
            <Check size={11} />
            <span><Trans>已连接本地 Engine ·</Trans></span>
            <select
              aria-label={t`本地工作流文件`}
              value={selectedFile}
              disabled={switching || workflowFiles.length === 0}
              onChange={(event) => onSelect(event.target.value)}
            >
              {workflowFiles.map((file) => (
                <option key={file} value={file}>{file}</option>
              ))}
            </select>
          </label>
        </div>
        <Button variant="ghost" size="sm" className="icon-button" loading={refreshing} disabled={switching} onClick={onReset} title={t`从本地文件重新读取`}>
          <RefreshCw size={14} /><Trans>
          重新读取
        </Trans></Button>
      </div>
      <div className="code-shell">
        <div ref={gutterRef} className="line-numbers" aria-hidden="true">
          {lineNumbers.map((line) => <div key={line}>{line}</div>)}
        </div>
        <textarea
          aria-label={t`工作流代码`}
          readOnly={!editable}
          className="code-input"
          value={code}
          spellCheck={false}
          onChange={(event) => { if (editable) onChange(event.target.value); }}
          onScroll={(event) => {
            if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
          }}
        />
      </div>
      <div className={`editor-footer ${error ? "text-red-600" : "text-emerald-700"}`}>
        <span className={`signal ${error ? "bg-red-500" : "bg-emerald-500"}`} />
        {error || (editable ? t`已保存到本地，拓扑来自 Graph.describe()` : t`生产环境只读，修改请在开发环境完成后重新构建`)}
      </div>
    </section>
  );
}
