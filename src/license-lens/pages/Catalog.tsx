import {useMemo, useState} from 'react';
import {Download, Plus, Search, ShieldBan} from 'lucide-react';
import {useStore} from '../store';
import {findDep, isRevoked} from '../rules';
import type {Dep} from '../types';
import {Badge, Banner, Btn, Empty, Field, Modal, inputCls} from '../ui/widgets';
import {fmtDate} from '../ui/format';

const licenseColors: Record<string, string> = {
  MIT: '#35b995', 'BSD-3-Clause': '#6d9ee8', 'Apache-2.0': '#b18ee4', 'GPL-3.0': '#ec8c75',
};

export default function Catalog() {
  const {state} = useStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'revoked' | 'risk'>('all');
  const [adding, setAdding] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(null);

  const filtered = useMemo(() => state.deps.filter((d) => {
    if (query && !`${d.name}${d.license}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (filter === 'revoked' && d.licenseStatus !== 'revoked') return false;
    if (filter === 'active' && d.licenseStatus !== 'active') return false;
    if (filter === 'risk' && d.status !== 'risk') return false;
    return true;
  }), [state.deps, query, filter]);

  const exportMd = () => {
    const lines = [
      '# License Lens · 依赖许可证清单',
      '',
      `导出时间：${fmtDate(Date.now())}`,
      '',
      '| 依赖 | 版本 | 许可证 | 许可证状态 | 备注 |',
      '|---|---|---|---|---|',
      ...state.deps.map((d) =>
        `| ${d.name} | ${d.version} | ${d.license} | ${isRevoked(d) ? '已撤销' : '有效'} | ${d.note} |`),
      '',
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], {type: 'text/markdown'}));
    a.download = 'license-report.md';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div>
      <div className="page-bar">
        <div className="page-bar-titles">
          <h1>依赖目录</h1>
          <p>许可证撤销作用于目录项，已发行批次中的引用会自动立案并冻结对应产物。</p>
        </div>
        <div className="head-actions">
          <Btn onClick={exportMd}><Download size={15}/>导出清单</Btn>
          <Btn variant="primary" onClick={() => setAdding(true)}><Plus size={15}/>添加依赖</Btn>
        </div>
      </div>

      <div className="card">
        <div className="pane-tools">
          <div className="search"><Search size={14}/>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索依赖 / 许可证"/>
          </div>
          <div className="seg">
            {([['all','全部'],['active','有效'],['risk','高风险'],['revoked','已撤销']] as const).map(
              ([k, t]) => <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)}>{t}</button>)}
          </div>
        </div>
        <div className="dep-table">
          <div className="dep-tr th"><span>依赖</span><span>许可证</span><span>许可证状态</span><span>引用 / 备注</span><span></span></div>
          {filtered.map((d) => <DepRow key={d.id} dep={d} onRevoke={() => setRevokeId(d.id)}/>)}
          {filtered.length === 0 && <Empty>没有匹配的依赖</Empty>}
        </div>
      </div>

      {adding && <AddDepModal onClose={() => setAdding(false)}/>}
      {revokeId && <RevokeModal depId={revokeId} onClose={() => setRevokeId(null)}/>}
    </div>
  );
}

function DepRow({dep, onRevoke}: {dep: Dep; onRevoke: () => void}) {
  const {state} = useStore();
  const refs = state.batches.filter((b) => b.manifest.some((m) => m.depId === dep.id));
  const color = licenseColors[dep.license] ?? '#8d9ca1';
  return (
    <div className="dep-tr">
      <span className="dep-name">
        <span className="pkg-dot" style={{background: color}}/>
        <b>{dep.name}</b><small>{dep.version} · {dep.source}</small>
      </span>
      <span><i className="license" style={{color, background: `${color}18`}}>{dep.license}</i>
        {dep.status === 'risk' && <Badge tone="orange">强 copyleft</Badge>}</span>
      <span>{isRevoked(dep)
        ? <Badge tone="red"><ShieldBan size={10}/> 已撤销</Badge>
        : <Badge tone="teal">有效</Badge>}</span>
      <span className="muted note-cell">
        {dep.note}
        {refs.length > 0 && <em>被 {refs.length} 个批次引用</em>}
        {dep.revokedReason && <em className="rev-reason">撤销原因：{dep.revokedReason}</em>}
      </span>
      <span className="row-action">
        {!isRevoked(dep) && <Btn variant="danger" size="sm" onClick={onRevoke}><ShieldBan size={12}/>撤销许可证</Btn>}
      </span>
    </div>
  );
}

function AddDepModal({onClose}: {onClose: () => void}) {
  const {addDep} = useStore();
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [license, setLicense] = useState('MIT');
  const [source, setSource] = useState('手动');
  const [err, setErr] = useState('');
  const submit = () => {
    const r = addDep({
      name: name.trim(), version: version.trim() || '1.0.0', license, source,
      status: /GPL|AGPL/i.test(license) ? 'risk' : license === 'MIT' ? 'ok' : 'warn',
      note: license === 'MIT' ? '宽松许可，可商用' : '请核对分发义务',
    });
    if (r.ok) onClose(); else setErr(r.error ?? '添加失败');
  };
  return (
    <Modal title="添加依赖" onClose={onClose}
      footer={<><Btn onClick={onClose}>取消</Btn><Btn variant="primary" onClick={submit}>加入目录</Btn></>}>
      <div className="form-grid">
        <Field label="依赖名称"><input autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 date-fns"/></Field>
        <Field label="版本"><input className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)}/></Field>
        <Field label="许可证"><select className={inputCls} value={license} onChange={(e) => setLicense(e.target.value)}>
          <option>MIT</option><option>BSD-3-Clause</option><option>Apache-2.0</option><option>GPL-3.0</option>
        </select></Field>
        <Field label="来源"><input className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}/></Field>
      </div>
      {err && <Banner tone="red">{err}</Banner>}
    </Modal>
  );
}

function RevokeModal({depId, onClose}: {depId: string; onClose: () => void}) {
  const {state, revokeDep} = useStore();
  const dep = findDep(state, depId);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const [warning, setWarning] = useState('');
  if (!dep) return null;
  const refs = state.batches.filter((b) => b.manifest.some((m) => m.depId === depId));

  const submit = () => {
    const r = revokeDep(depId, reason);
    if (!r.ok) { setErr(r.error ?? '撤销失败'); return; }
    if (r.warning) { setWarning(r.warning); setErr(''); return; }
    onClose();
  };

  return (
    <Modal title={`撤销许可证 · ${dep.name}`} onClose={onClose}
      footer={<>{warning
        ? <Btn variant="primary" onClick={onClose}>完成</Btn>
        : <><Btn onClick={onClose}>取消</Btn>
          <Btn variant="danger" onClick={submit}><ShieldBan size={14}/>确认撤销</Btn></>}</>}>
      <Banner tone="red" title="撤销后的自动动作">
        <p>目录项标记为已撤销；被它波及的已发行批次（{refs.length} 个）将新开撤销事故并冻结对应产物，撤回与替代覆盖在事故台中完成。</p>
      </Banner>
      <Field label="撤销原因（必填）">
        <textarea className={inputCls} rows={3} value={reason}
          onChange={(e) => setReason(e.target.value)} placeholder="例如：上游授权方终止商业分发授权"/>
      </Field>
      {err && <Banner tone="red">{err}</Banner>}
      {warning && <Banner tone="orange">{warning}</Banner>}
    </Modal>
  );
}
