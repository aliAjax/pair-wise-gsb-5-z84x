// 页面：事故处置台（撤销冻结 / 撤回回滚 / 替代恢复 / 解除）

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, History, PackageX, RotateCcw, ShieldOff, Snowflake,
  Sparkles, Siren, Wrench,
} from 'lucide-react';
import type { DepRef, Incident } from '../types';
import {
  artifactById, currentBatchOf, currentSnapshot, incidentArtifact, isArtifactFrozen,
  offendingKeysInSnapshot, revokedLicenseSet, rollbackTarget, snapshotIsLiveCompliant,
  uncoveredRefs,
} from '../rules';
import {
  openReportIncident, recoverBatch, resolveIncident, revokeLicense, useStore, withdrawBatch,
} from '../store';
import { Badge, Empty, ErrorLine, Field, Modal, fmtDate, relTime } from './shared';
import { DepEditor, makeDep as makeDraftDep } from './deps';

type Draft = { name: string; version: string; license: string; source: string; refs: string[] };

export default function IncidentsPage({ now }: { now: number }) {
  const s = useStore();
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => s.incidents.find(i => i.status === 'open')?.id ?? s.incidents[0]?.id,
  );
  const [showRevoke, setShowRevoke] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showRecover, setShowRecover] = useState(false);
  const [error, setError] = useState<string>();
  const [toast, setToast] = useState<string>();

  const selected = s.incidents.find(i => i.id === selectedId)
    ?? s.incidents.find(i => i.status === 'open')
    ?? s.incidents[0];

  const sorted = useMemo(
    () => [...s.incidents].sort((a, b) => (a.status === b.status ? b.createdAt - a.createdAt : a.status === 'open' ? -1 : 1)),
    [s.incidents],
  );
  const openCount = s.incidents.filter(i => i.status === 'open').length;
  const frozenCount = s.artifacts.filter(a => isArtifactFrozen(s, a.id)).length;

  const flash = (msg?: string) => { setToast(msg); if (msg) window.setTimeout(() => setToast(undefined), 3200); };
  const run = (r: { ok: boolean; error?: string }, okMsg: string) => {
    if (!r.ok) { setError(r.error); return false; }
    setError(undefined); flash(okMsg); return true;
  };

  return (
    <div>
      <PageHead
        title="许可证事故回滚台"
        desc="登记发行事故，冻结产物、撤回回滚到最近合规快照，替代依赖覆盖全部引用路径后整批恢复。"
        actions={
          <>
            <button className="outline" onClick={() => { setError(undefined); setShowReport(true); }}><Siren size={15} />登记举报事故</button>
            <button className="danger" onClick={() => { setError(undefined); setShowRevoke(true); }}><Ban size={15} />撤销许可证</button>
          </>
        }
      />

      <section className="hero hero-alert">
        <div>
          <span className="tag">INCIDENT RESPONSE</span>
          <h2>{openCount > 0 ? `${openCount} 起事故待处置` : '当前没有待处置事故'}</h2>
          <p>其中 <b className="warning">{frozenCount} 个产物</b> 因许可证撤销被冻结，事故解除前不得发布新批次。</p>
        </div>
        <div className="scan-score">
          <div className={`score-ring ${openCount ? 'ring-danger' : ''}`}><strong>{s.incidents.length - openCount}<small>/{s.incidents.length}</small></strong></div>
          <div><span>已解除 / 全部</span><b>{openCount ? '处置中' : '全部清零'}</b><small>刷新后状态自动对齐</small></div>
        </div>
      </section>

      {toast && <div className="toast"><CheckCircle2 size={15} /> {toast}</div>}

      <section className="workspace incident-layout">
        <div className="table-pane">
          <div className="pane-head">
            <div><h2>事故队列</h2><p>同产物只保留一条待处置事故</p></div>
          </div>
          <div className="incident-list">
            {sorted.map(i => {
              const art = incidentArtifact(s, i);
              const frozen = i.kind === 'revoked' && i.status === 'open';
              return (
                <button
                  key={i.id}
                  className={`incident-card ${selected?.id === i.id ? 'selected' : ''} ${i.status === 'resolved' ? 'resolved' : ''}`}
                  onClick={() => { setSelectedId(i.id); setError(undefined); }}
                >
                  <div className="incident-card-top">
                    <span className={`incident-ic ${frozen ? 'frozen' : i.kind === 'report' ? 'report' : 'done'}`}>
                      {frozen ? <Snowflake size={15} /> : i.kind === 'report' ? <Siren size={15} /> : <CheckCircle2 size={15} />}
                    </span>
                    <b>{i.title}</b>
                    <span className="incident-time">{relTime(i.createdAt, now)}</span>
                  </div>
                  <div className="incident-card-meta">
                    <span className="mono">{i.id}</span>
                    <span>{art?.code ?? '未知产物'}</span>
                    {i.status === 'open'
                      ? <Badge tone={frozen ? 'blue' : 'orange'}>{frozen ? '已冻结' : '待处置'}</Badge>
                      : <Badge tone="teal">已解除</Badge>}
                  </div>
                </button>
              );
            })}
            {sorted.length === 0 && <Empty text="还没有事故记录" />}
          </div>
        </div>

        {selected
          ? <IncidentDetail
              key={selected.id} incident={selected}
              onWithdraw={() => { setError(undefined); setShowWithdraw(true); }}
              onRecover={() => { setError(undefined); setShowRecover(true); }}
              onResolve={() => run(resolveIncident(selected.id), `事故 ${selected.id} 已解除${selected.kind === 'revoked' ? '，产物解冻' : ''}`)}
              error={error}
              now={now}
            />
          : <div className="detail"><Empty text="选择左侧事故查看处置台" /></div>}
      </section>

      {showRevoke && <RevokeModal onClose={() => setShowRevoke(false)} onDone={(r) => {
        if (run(r, `许可证已撤销，冻结 ${r.frozen} 个产物`)) setShowRevoke(false);
      }} />}
      {showReport && <ReportModal onClose={() => setShowReport(false)} onDone={(r) => {
        if (run(r, '举报事故已登记，发布通道已锁定')) setShowReport(false);
      }} />}
      {showWithdraw && selected && (
        <WithdrawModal incident={selected} onClose={() => setShowWithdraw(false)} onDone={(r) => {
          if (run(r, '批次已撤回并回退到最近合规快照，原因已留档')) setShowWithdraw(false);
        }} />
      )}
      {showRecover && selected && (
        <RecoverModal incident={selected} onClose={() => setShowRecover(false)} onDone={(r) => {
          if (run(r, '替代依赖覆盖全部引用路径，整批已恢复')) setShowRecover(false);
        }} />
      )}
    </div>
  );
}

export function PageHead({ title, desc, actions }: { title: string; desc: string; actions?: React.ReactNode }) {
  return (
    <header>
      <div><div className="crumb">ROLLBACK CONSOLE / <b>POST-DISTRIBUTION</b></div><h1>{title}</h1><p>{desc}</p></div>
      {actions && <div className="head-actions">{actions}</div>}
    </header>
  );
}

function IncidentDetail({
  incident, onWithdraw, onRecover, onResolve, error, now,
}: {
  incident: Incident; onWithdraw: () => void; onRecover: () => void; onResolve: () => void;
  error?: string; now: number;
}) {
  const s = useStore();
  const art = artifactById(s, incident.artifactId);
  const batch = currentBatchOf(s, incident.artifactId);
  const cur = batch ? currentSnapshot(batch) : undefined;
  const revoked = revokedLicenseSet(s.licenses);
  const offendingKeys = batch ? offendingKeysInSnapshot(s, batch, incident) : [];
  const target = batch ? rollbackTarget(batch, revoked, incident.offendingDepKeys) : undefined;
  const frozen = isArtifactFrozen(s, incident.artifactId);
  const originalRefs = incident.originalRefs ?? [];
  // 覆盖口径：当前快照里除“问题依赖”外的其他依赖所覆盖的原路径数（恢复后新快照即全覆盖）
  const coveredSet = new Set(
    (cur?.deps ?? []).filter(d => !offendingKeys.includes(d.key)).flatMap(d => d.refs),
  );
  const coveredCount = originalRefs.filter(r => coveredSet.has(r)).length;
  const missing = originalRefs.filter(r => !coveredSet.has(r));

  const steps = [
    { label: '事故登记 / 冻结产物', done: true },
    { label: batch?.state === 'withdrawn' ? '已撤回，回退到最近合规快照' : '撤回并回滚（留原因）', done: batch?.state === 'withdrawn', active: incident.status === 'open' && batch?.state !== 'withdrawn' },
    { label: '替代依赖覆盖全部引用路径', done: batch?.state === 'recovered', active: incident.status === 'open' && batch?.state !== 'recovered' },
    { label: '解除事故、产物解冻', done: incident.status === 'resolved', active: incident.status === 'open' && batch?.state === 'recovered' },
  ];

  return (
    <div className="detail incident-detail">
      <div className="detail-head">
        <div className={`detail-icon ic-${frozen ? 'frozen' : incident.kind === 'report' ? 'report' : 'ok'}`}>
          {frozen ? <ShieldOff size={20} /> : incident.kind === 'report' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
        </div>
        <div>
          <span>{incident.kind === 'revoked' ? 'LICENSE REVOCATION' : 'COMPLIANCE REPORT'} · <span className="mono">{incident.id}</span></span>
          <h2>{incident.title}</h2>
        </div>
        {incident.status === 'open'
          ? <Badge tone={frozen ? 'blue' : 'orange'}>{frozen ? '冻结中' : '待处置'}</Badge>
          : <Badge tone="teal">已解除</Badge>}
      </div>

      <p className="incident-desc">{incident.detail}</p>
      <div className="detail-grid">
        <div><label>产物</label><b>{art?.name ?? '—'}</b></div>
        <div><label>当前批次</label><b>{batch ? `${batch.version}（${batch.id}）` : '无'}</b></div>
        <div><label>批次状态</label><b>{batch ? batch.state === 'released' ? '分发中' : batch.state === 'withdrawn' ? '已撤回' : '已恢复' : '—'}</b></div>
        <div><label>登记时间</label><b>{fmtDate(incident.createdAt)}</b></div>
        <div><label>解除时间</label><b>{fmtDate(incident.resolvedAt)}</b></div>
        <div><label>发布锁</label><b className={incident.status === 'open' ? 'red' : 'teal'}>{incident.status === 'open' ? '锁定：不得发布新批次' : '已释放'}</b></div>
      </div>

      <ol className="steps">
        {steps.map((st, i) => (
          <li key={i} className={st.done ? 'done' : st.active ? 'active' : ''}>
            <span className="step-dot">{st.done ? <CheckCircle2 size={14} /> : i + 1}</span>{st.label}
          </li>
        ))}
      </ol>

      {cur && (
        <div className="snap-box">
          <div className="snap-box-head"><History size={14} /><b>当前快照</b><span className="mono">{cur.label}</span>
            {snapshotIsLiveCompliant(cur, revoked) && offendingKeys.length === 0
              ? <Badge tone="teal">合规</Badge>
              : <Badge tone="red">含问题依赖</Badge>}
          </div>
          <div className="dep-rows">
            {cur.deps.map(d => (
              <div key={d.key} className={`dep-row ${offendingKeys.includes(d.key) ? 'bad' : ''}`}>
                <span>{d.name} <small>{d.version}</small></span>
                <Badge tone={revoked.has(d.license) ? 'red' : 'gray'}>{d.license}</Badge>
                <small className="refs">{d.refs.join('，') || '无引用路径'}</small>
              </div>
            ))}
          </div>
          {originalRefs.length > 0 && (
            <div className="coverage">
              <span>{coveredCount}/{originalRefs.length} 条原引用路径已被当前快照覆盖</span>
              <div className="coverage-bar"><i className={missing.length === 0 ? 'full' : ''} style={{ width: `${coveredCount / originalRefs.length * 100}%` }} /></div>
              {missing.length > 0 && batch?.state !== 'recovered' && <small>待替代覆盖：{missing.join('、')}</small>}
            </div>
          )}
        </div>
      )}

      {target && incident.status === 'open' && batch?.state !== 'withdrawn' && (
        <div className="hint-line">可回退到最近合规快照：<b>{target.label}</b>（{fmtDate(target.at)}）</div>
      )}
      {!target && incident.status === 'open' && batch?.state === 'released' && (
        <div className="hint-line warn"><PackageX size={14} /> 同批次没有可回退的合规快照——只能直接登记替代依赖整批恢复。</div>
      )}

      {(incident.rollbacks.length > 0 || incident.withdrawals.length > 0) && (
        <div className="action-log">
          <b>处置留痕</b>
          {incident.rollbacks.map((r, i) => (
            <div key={i} className="action-row"><RotateCcw size={13} /><span>{fmtDate(r.at)} 回滚 <span className="mono">{r.fromSnapshotId}</span> → <span className="mono">{r.toSnapshotId}</span></span><small>{r.reason}</small></div>
          ))}
        </div>
      )}
      {incident.status === 'resolved' && incident.resolution && <div className="finding ok"><div className="finding-icon"><CheckCircle2 size={16} /></div><div><b>事故已解除</b><p>{incident.resolution}（{fmtDate(incident.resolvedAt ?? now)}）</p></div></div>}

      <ErrorLine text={error} />
      {incident.status === 'open' && (
        <div className="detail-actions">
          {batch?.state === 'released' && target && <button className="outline" onClick={onWithdraw}><RotateCcw size={14} />撤回并回滚</button>}
          {batch?.state !== 'recovered' && <button className="primary" onClick={onRecover}><Wrench size={14} />登记替代依赖 / 整批恢复</button>}
          <button className={batch?.state === 'recovered' || incident.kind === 'report' ? 'primary' : 'outline'} onClick={onResolve} disabled={incident.kind === 'revoked' && batch?.state !== 'recovered'}>
            <CheckCircle2 size={14} />解除事故
          </button>
        </div>
      )}
    </div>
  );
}

function RevokeModal({ onClose, onDone }: { onClose: () => void; onDone: (r: ReturnType<typeof revokeLicense>) => void }) {
  const s = useStore();
  const [name, setName] = useState(s.licenses.find(l => l.status === 'active')?.name ?? '');
  const [note, setNote] = useState('');
  const active = s.licenses.filter(l => l.status === 'active');
  return (
    <Modal title={<><Ban size={17} /> 撤销许可证</>} onClose={onClose} width={460}>
      <p className="modal-intro">撤销后，所有引用该许可证的在分发产物立即冻结，并各自生成一条待处置事故；同产物已有待处置事故时自动跳过。</p>
      <Field label="许可证">
        <select value={name} onChange={e => setName(e.target.value)}>
          {active.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="撤销说明（随事故留档）"><textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：授权方终止函编号、生效时间" /></Field>
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button><button className="danger full" onClick={() => onDone(revokeLicense(name, note))}>确认撤销并冻结</button></div>
    </Modal>
  );
}

function ReportModal({ onClose, onDone }: { onClose: () => void; onDone: (r: ReturnType<typeof openReportIncident>) => void }) {
  const s = useStore();
  const eligible = s.artifacts.filter(a => !s.incidents.some(i => i.artifactId === a.id && i.status === 'open'));
  const [artifactId, setArtifactId] = useState(eligible[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [depKeys, setDepKeys] = useState<string[]>([]);
  const batch = artifactId ? currentBatchOf(s, artifactId) : undefined;
  const cur = batch ? currentSnapshot(batch) : undefined;
  return (
    <Modal title={<><Siren size={17} /> 登记合规举报事故</>} onClose={onClose} width={500}>
      <Field label="涉及产物（已有待处置事故的产物不可选）">
        <select value={artifactId} onChange={e => { setArtifactId(e.target.value); setDepKeys([]); }}>
          {eligible.map(a => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
        </select>
      </Field>
      <Field label="事故标题"><input value={title} onChange={e => setTitle(e.target.value)} placeholder="例如：GPL 依赖闭源分发举报" /></Field>
      <Field label="补充说明"><textarea rows={2} value={detail} onChange={e => setDetail(e.target.value)} /></Field>
      {cur && (
        <div className="field"><span>涉及依赖（勾选后纳入问题清单与引用覆盖范围）</span>
          <div className="check-list">
            {cur.deps.map(d => (
              <label key={d.key} className="check-item">
                <input type="checkbox" checked={depKeys.includes(d.key)} onChange={e => setDepKeys(ks => e.target.checked ? [...ks, d.key] : ks.filter(k => k !== d.key))} />
                <b>{d.name}</b><small>{d.version} · {d.license}</small><small className="refs">{d.refs.join('，')}</small>
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" onClick={() => onDone(openReportIncident({ artifactId, title, detail, depKeys }))}>登记并锁定发布</button></div>
    </Modal>
  );
}

function WithdrawModal({ incident, onClose, onDone }: { incident: Incident; onClose: () => void; onDone: (r: ReturnType<typeof withdrawBatch>) => void }) {
  const s = useStore();
  const batch = currentBatchOf(s, incident.artifactId)!;
  const target = rollbackTarget(batch, revokedLicenseSet(s.licenses), incident.offendingDepKeys)!;
  const [reason, setReason] = useState(incident.kind === 'revoked' ? `许可证撤销，撤回 ${batch.version} 并回退到最近合规快照` : '');
  return (
    <Modal title={<><RotateCcw size={17} /> 撤回批次并回滚</>} onClose={onClose} width={480}>
      <div className="rollback-map">
        <div><label>当前快照</label><b>{currentSnapshot(batch)?.label}</b><Badge tone="red">含问题依赖</Badge></div>
        <span className="arrow">→</span>
        <div><label>回退目标（最近合规）</label><b>{target.label}</b><Badge tone="teal">合规</Badge></div>
      </div>
      <p className="modal-intro">撤回只允许回退到最近的合规快照，原因将写入事故与审计日志；批次状态变为“已撤回”，等待替代恢复。</p>
      <Field label="撤回原因（必填，留档）"><textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="说明撤回依据与决策人" /></Field>
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="danger full" onClick={() => onDone(withdrawBatch(incident.id, reason))}>确认撤回</button></div>
    </Modal>
  );
}

function RecoverModal({ incident, onClose, onDone }: { incident: Incident; onClose: () => void; onDone: (r: ReturnType<typeof recoverBatch>) => void }) {
  const s = useStore();
  const batch = currentBatchOf(s, incident.artifactId)!;
  const base = currentSnapshot(batch)!;
  const originalRefs = incident.originalRefs ?? [];
  const revoked = revokedLicenseSet(s.licenses);
  const licenses = s.licenses.filter(l => l.status === 'active').map(l => l.name);
  const [drafts, setDrafts] = useState<Draft[]>([makeDraftDep()]);
  const [err, setErr] = useState<string>();

  const deps: DepRef[] = drafts
    .filter(d => d.name.trim() && d.refs.length > 0)
    .map((d, i) => ({ key: `repl-${i}`, name: d.name.trim(), version: d.version.trim() || '0.0.0', license: d.license, source: d.source, refs: d.refs }));
  const covered = new Set(deps.flatMap(d => d.refs));
  const missing = originalRefs.filter(r => !covered.has(r));
  const overCovered = deps.flatMap(d => d.refs.filter(r => !originalRefs.includes(r)));
  const invalid = deps.some(d => revoked.has(d.license));

  const submit = () => {
    if (deps.length === 0) { setErr('请至少填写一个替代依赖，并勾选其覆盖的引用路径'); return; }
    if (overCovered.length > 0) { setErr('替代依赖勾选了不属于原引用范围的路径'); return; }
    if (invalid) { setErr('替代依赖使用了已撤销许可证'); return; }
    if (missing.length > 0) { setErr(`仍有 ${missing.length} 条原引用路径未覆盖：${missing.join('、')}。整批不能恢复`); return; }
    const r = recoverBatch(incident.id, deps);
    if (!r.ok) { setErr(r.error); return; }
    onDone(r);
  };

  return (
    <Modal title={<><Wrench size={17} /> 替代依赖整批恢复</>} onClose={onClose} width={680}>
      <p className="modal-intro">
        基线快照：<b>{base.label}</b>。每一条原引用路径都必须被某个替代依赖覆盖，缺一不可，否则整批不能恢复、事故不能解除。
      </p>
      <div className="coverage coverage-modal">
        <span>{originalRefs.length - missing.length}/{originalRefs.length} 条原引用路径已覆盖</span>
        <div className="coverage-bar"><i className={missing.length > 0 ? '' : 'full'} style={{ width: `${(originalRefs.length - missing.length) / Math.max(1, originalRefs.length) * 100}%` }} /></div>
        {missing.length > 0 && <small className="red">缺失：{missing.join('、')}</small>}
      </div>

      <div className="repl-list">
        {drafts.map((d, idx) => (
          <div key={idx} className="repl-card">
            <div className="repl-card-head"><b>替代依赖 {idx + 1}</b>
              {drafts.length > 1 && <button className="link-danger" onClick={() => setDrafts(ds => ds.filter((_, j) => j !== idx))}>移除</button>}
            </div>
            <DepEditor dep={d} licenses={licenses} onChange={nd => setDrafts(ds => ds.map((x, j) => j === idx ? nd : x))} />
            <div className="repl-refs">
              <span>覆盖的原引用路径：</span>
              <div className="check-list">
                {originalRefs.map(r => (
                  <label key={r} className="chip-check">
                    <input
                      type="checkbox" checked={d.refs.includes(r)}
                      disabled={!d.refs.includes(r) && covered.has(r)}
                      onChange={e => setDrafts(ds => ds.map((x, j) => j === idx
                        ? { ...x, refs: e.target.checked ? [...x.refs, r] : x.refs.filter(z => z !== r) }
                        : x))}
                    /><code>{r}</code>
                  </label>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
      <button className="outline add-repl" onClick={() => setDrafts(ds => [...ds, makeDraftDep(licenses[0] ?? 'MIT')])}><Sparkles size={14} />再加一个替代依赖</button>

      <ErrorLine text={err} />
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" disabled={missing.length > 0} onClick={submit}>生成恢复快照并整批恢复</button></div>
    </Modal>
  );
}
