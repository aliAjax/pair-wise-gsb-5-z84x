// 依赖清单编辑组件：发布批次 / 替代恢复共用，纯受控组件。

import { Plus, Trash2 } from 'lucide-react';
import type { DepRef } from '../types';

export type DepDraft = { name: string; version: string; license: string; source: string; refs: string[] };

export function makeDep(license = 'MIT'): DepDraft {
  return { name: '', version: '1.0.0', license, source: 'npm', refs: [] };
}

export function DepEditor({
  dep, licenses, onChange,
}: { dep: DepDraft; licenses: string[]; onChange: (d: DepDraft) => void }) {
  return (
    <div className="dep-editor">
      <input placeholder="依赖名，如 date-fns" value={dep.name} onChange={e => onChange({ ...dep, name: e.target.value })} />
      <input placeholder="版本" value={dep.version} onChange={e => onChange({ ...dep, version: e.target.value })} />
      <select value={dep.license} onChange={e => onChange({ ...dep, license: e.target.value })}>
        {licenses.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
      <select value={dep.source} onChange={e => onChange({ ...dep, source: e.target.value })}>
        {['npm', 'pub', '内部', '手动', '商业包仓库'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    </div>
  );
}

export function RefEditor({ refs, onChange, placeholder }: { refs: string[]; onChange: (r: string[]) => void; placeholder?: string }) {
  return (
    <div className="ref-editor">
      {refs.map((r, i) => (
        <div key={i} className="ref-row">
          <code>{r}</code>
          <button onClick={() => onChange(refs.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <RefAdder onAdd={(r) => { if (r && !refs.includes(r)) onChange([...refs, r]); }} placeholder={placeholder} />
    </div>
  );
}

function RefAdder({ onAdd, placeholder }: { onAdd: (r: string) => void; placeholder?: string }) {
  return (
    <form className="ref-add" onSubmit={e => { e.preventDefault(); const input = (e.currentTarget.elements.namedItem('ref') as HTMLInputElement); onAdd(input.value.trim()); input.value = ''; }}>
      <input name="ref" placeholder={placeholder ?? '引用路径，如 src/analytics/flow.ts'} />
      <button className="outline" type="submit"><Plus size={13} />路径</button>
    </form>
  );
}

export function DepRowsEditor({
  deps, licenses, onChange,
}: { deps: DepDraft[]; licenses: string[]; onChange: (d: DepDraft[]) => void }) {
  return (
    <div className="dep-rows-editor">
      <div className="dep-row th"><span>依赖 / 版本</span><span>许可证</span><span>来源</span><span>引用路径</span><span /></div>
      {deps.map((d, i) => (
        <div key={i} className="dep-row-edit">
          <DepEditor dep={d} licenses={licenses} onChange={nd => onChange(deps.map((x, j) => j === i ? nd : x))} />
          <RefEditor refs={d.refs} onChange={r => onChange(deps.map((x, j) => j === i ? { ...x, refs: r } : x))} />
          <button className="icon-btn" onClick={() => onChange(deps.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
        </div>
      ))}
      <button className="outline add-dep" onClick={() => onChange([...deps, makeDep(licenses[0] ?? 'MIT')])}><Plus size={14} />添加依赖</button>
    </div>
  );
}

export function draftsToDeps(drafts: DepDraft[]): DepRef[] {
  return drafts
    .filter(d => d.name.trim())
    .map((d, i) => ({
      key: `new-${Date.now().toString(36)}-${i}`,
      name: d.name.trim(),
      version: d.version.trim() || '0.0.0',
      license: d.license,
      source: d.source,
      refs: d.refs,
    }));
}
