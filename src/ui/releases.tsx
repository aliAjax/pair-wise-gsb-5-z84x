// 页面：发行登记（产物、批次、依赖快照、渠道）。事故未解除前发布按钮直接禁用。

import { useMemo, useState } from 'react';
import {
  Box, GitCommitHorizontal, Layers, Lock, Plus, Rocket, Snowflake,
} from 'lucide-react';
import type { Artifact } from '../types';
import {
  canPublishBatch, currentBatchOf, currentSnapshot, findOpenIncident, isArtifactFrozen,
  revokedLicenseSet, snapshotIsLiveCompliant,
} from '../rules';
import { publishBatch, registerArtifact, useStore } from '../store';
import { Badge, Empty, ErrorLine, Field, Modal, fmtDate, relTime } from './shared';
import { DepRowsEditor, draftsToDeps, makeDep, type DepDraft } from './deps';
import { PageHead } from './incidents';

export default function ReleasesPage({ now }: { now: number }) {
  const s = useStore();
  const [selectedId, setSelectedId] = useState<string>(s.artifacts[0]?.id ?? '');
  const [showRegister, setShowRegister] = useState(false);
  const [showPublish, setShowPublish] = useState(false);

  const selected = s.artifacts.find(a => a.id === selectedId) ?? s.artifacts[0];
  const revoked = revokedLicenseSet(s.licenses);
  const batchCount = s.batches.length;
  const withdrawn = s.batches.filter(b => b.state === 'withdrawn').length;
  const recovered = s.batches.filter(b => b.state === 'recovered').length;

  const batches = useMemo(
    () => s.batches.filter(b => !selected || b.artifactId === selected.id).sort((a, b) => b.releasedAt - a.releasedAt),
    [s.batches, selected],
  );

  return (
    <div>
      <PageHead
        title="发行登记"
        desc="管理分发产物、发布批次、每批依赖清单快照与渠道；冻结或待处置事故期间发布通道锁定。"
        actions={<button className="primary" onClick={() => setShowRegister(true)}><Plus size={16} />登记产物</button>}
      />

      <section className="summary">
        <div><span>登记产物</span><b>{s.artifacts.length}</b><small>发行登记在册</small></div>
        <div><span>累计批次</span><b className="teal">{batchCount}</b><small>含全部版本快照</small></div>
        <div><span>撤回待恢复</span><b className="orange">{withdrawn}</b><small>已回退到合规快照</small></div>
        <div><span>替代恢复批次</span><b className="teal">{recovered}</b><small>引用路径已全覆盖</small></div>
        <div><span>已冻结产物</span><b className="red">{s.artifacts.filter(a => isArtifactFrozen(s, a.id)).length}</b><small>事故解除前禁发</small></div>
      </section>

      <section className="workspace releases-layout">
        <div className="table-pane">
          <div className="pane-head"><div><h2>产物</h2><p>选择产物查看批次与快照</p></div></div>
          <div className="artifact-list">
            {s.artifacts.map(a => {
              const frozen = isArtifactFrozen(s, a.id);
              const open = findOpenIncident(s, a.id);
              const batch = currentBatchOf(s, a.id);
              return (
                <button key={a.id} className={`artifact-card ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => setSelectedId(a.id)}>
                  <div className="artifact-card-top">
                    <span className={`artifact-ic ${frozen ? 'frozen' : ''}`}>{frozen ? <Snowflake size={15} /> : <Box size={15} />}</span>
                    <b>{a.name}</b>
                    {frozen
                      ? <Badge tone="blue">冻结</Badge>
                      : open ? <Badge tone="orange">事故中</Badge> : <Badge tone="teal">正常</Badge>}
                  </div>
                  <div className="artifact-meta">
                    <span className="mono">{a.code}</span>
                    <span>{a.owner}</span>
                    <span>{batch ? `当前 ${batch.version}` : '尚未发布'}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {selected
          ? <ArtifactDetail artifact={selected} onPublish={() => setShowPublish(true)} now={now} />
          : <div className="detail"><Empty text="还没有登记产物" /></div>}
      </section>

      <section className="table-pane batch-section">
        <div className="pane-head"><div><h2>批次与快照</h2><p>{selected?.code ?? ''} 每次发布与回滚 / 恢复都留快照</p></div></div>
        <div className="batch-grid">
          {batches.map(b => {
            const cur = currentSnapshot(b);
            const clean = cur && snapshotIsLiveCompliant(cur, revoked);
            return (
              <div key={b.id} className="batch-card">
                <div className="batch-top">
                  <GitCommitHorizontal size={15} />
                  <b>{b.version}</b>
                  <Badge tone={b.state === 'released' ? (clean ? 'teal' : 'red') : b.state === 'withdrawn' ? 'orange' : 'purple'}>
                    {b.state === 'released' ? (clean ? '分发中·合规' : '分发中·含风险') : b.state === 'withdrawn' ? '已撤回' : '已恢复'}
                  </Badge>
                </div>
                <div className="batch-meta"><span className="mono">{b.id}</span><span>{relTime(b.releasedAt, now)}</span></div>
                <div className="batch-channels">{b.channelIds.map(id => {
                  const ch = s.channels.find(c => c.id === id);
                  return <span key={id} className="channel-chip">{ch?.name ?? id}</span>;
                })}</div>
                <div className="snap-chain">
                  {b.snapshots.map(sn => (
                    <div key={sn.id} className={`snap-node ${sn.id === b.currentSnapshotId ? 'current' : ''} ${snapshotIsLiveCompliant(sn, revoked) ? '' : 'bad'}`}>
                      <span className="snap-dot" />
                      <div><b>{sn.label}</b><small>{fmtDate(sn.at)} · {sn.deps.length} 依赖</small>
                        {sn.id === b.currentSnapshotId && <Badge tone="gray">当前</Badge>}
                        {!snapshotIsLiveCompliant(sn, revoked) && <Badge tone="red">现行判定不合规</Badge>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
          {batches.length === 0 && <Empty text="该产物还没有发布批次" />}
        </div>
      </section>

      {showRegister && <RegisterModal onClose={() => setShowRegister(false)} onDone={r => { if (r.ok) setShowRegister(false); }} />}
      {showPublish && selected && (
        <PublishModal artifact={selected} onClose={() => setShowPublish(false)} onDone={r => { if (r.ok) setShowPublish(false); }} />
      )}
    </div>
  );
}

function ArtifactDetail({ artifact, onPublish, now }: { artifact: Artifact; onPublish: () => void; now: number }) {
  const s = useStore();
  const batch = currentBatchOf(s, artifact.id);
  const open = findOpenIncident(s, artifact.id);
  const frozen = isArtifactFrozen(s, artifact.id);
  const guard = canPublishBatch(s, artifact.id);
  const cur = batch ? currentSnapshot(batch) : undefined;
  return (
    <div className="detail">
      <div className="detail-head">
        <div className={`detail-icon ${frozen ? 'ic-frozen' : ''}`}>{frozen ? <Snowflake size={20} /> : <Layers size={20} />}</div>
        <div><span>REGISTERED ARTIFACT · <span className="mono">{artifact.code}</span></span><h2>{artifact.name}</h2></div>
        {frozen ? <Badge tone="blue">冻结</Badge> : open ? <Badge tone="orange">事故处置中</Badge> : <Badge tone="teal">可发布</Badge>}
      </div>
      <div className="detail-grid">
        <div><label>负责团队</label><b>{artifact.owner}</b></div>
        <div><label>登记时间</label><b>{fmtDate(artifact.createdAt)}</b></div>
        <div><label>当前批次</label><b>{batch ? batch.version : '—'}</b></div>
      </div>
      {cur && (
        <div className="finding warn">
          <div className="finding-icon"><Rocket size={16} /></div>
          <div><b>{cur.label}</b><p>共 {cur.deps.length} 项依赖，经 {batch?.channelIds.length ?? 0} 个渠道分发；发布于 {fmtDate(batch?.releasedAt ?? now)}。</p></div>
        </div>
      )}
      {frozen && (
        <div className="finding risk"><div className="finding-icon"><Lock size={16} /></div><div><b>发布已锁定</b><p>存在待处置的许可证撤销事故（{open?.id}），整产物冻结。请先到事故台完成撤回 / 替代恢复并解除事故。</p></div></div>
      )}
      {!frozen && open && (
        <div className="finding warn"><div className="finding-icon"><Lock size={16} /></div><div><b>事故未解除，不得发布新批次</b><p>待处置事故 {open.id}：{open.title}</p></div></div>
      )}
      <div className="detail-actions">
        <button className="primary" disabled={!guard.ok} title={guard.ok ? '' : guard.error} onClick={onPublish}>
          <Rocket size={14} />发布新批次
        </button>
        {!guard.ok && <small className="lock-note">{guard.error}</small>}
      </div>
    </div>
  );
}

function RegisterModal({ onClose, onDone }: { onClose: () => void; onDone: (r: ReturnType<typeof registerArtifact>) => void }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [owner, setOwner] = useState('');
  const [err, setErr] = useState<string>();
  return (
    <Modal title={<><Box size={17} /> 登记发行产物</>} onClose={onClose} width={440}>
      <Field label="产物名称"><input value={name} onChange={e => setName(e.target.value)} placeholder="例如 Terra Mobile App" /></Field>
      <Field label="产物编号"><input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="例如 TERRA-MOB" /></Field>
      <Field label="负责团队"><input value={owner} onChange={e => setOwner(e.target.value)} placeholder="例如 移动端组" /></Field>
      <ErrorLine text={err} />
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" onClick={() => { const r = registerArtifact({ name, code, owner }); if (!r.ok) setErr(r.error); onDone(r); }}>登记</button></div>
    </Modal>
  );
}

function PublishModal({ artifact, onClose, onDone }: { artifact: Artifact; onClose: () => void; onDone: (r: ReturnType<typeof publishBatch>) => void }) {
  const s = useStore();
  const guard = canPublishBatch(s, artifact.id);
  const current = currentBatchOf(s, artifact.id);
  const curSnap = current ? currentSnapshot(current) : undefined;
  const [version, setVersion] = useState(current ? bumpVersion(current.version) : '1.0.0');
  const [channelIds, setChannelIds] = useState<string[]>(current?.channelIds ?? s.channels.slice(0, 1).map(c => c.id));
  const initial: DepDraft[] = curSnap
    ? curSnap.deps.map(d => ({ name: d.name, version: d.version, license: d.license, source: d.source, refs: [...d.refs] }))
    : [makeDep()];
  const [deps, setDeps] = useState<DepDraft[]>(initial);
  const [err, setErr] = useState<string>();
  const activeLicenses = s.licenses.filter(l => l.status === 'active').map(l => l.name);

  if (!guard.ok) {
    return (
      <Modal title={<><Rocket size={17} /> 发布新批次</>} onClose={onClose} width={440}>
        <div className="finding risk"><div className="finding-icon"><Lock size={16} /></div><div><b>不能发布</b><p>{guard.error}</p></div></div>
        <div className="modal-actions"><button className="primary full" onClick={onClose}>知道了</button></div>
      </Modal>
    );
  }

  const submit = () => {
    const r = publishBatch({
      artifactId: artifact.id, version, channelIds, deps: draftsToDeps(deps).map(d => ({ ...d, refs: d.refs })),
    });
    if (!r.ok) { setErr(r.error); return; }
    onDone(r);
  };

  return (
    <Modal title={<><Rocket size={17} /> 发布新批次 · {artifact.code}</>} onClose={onClose} width={760}>
      <div className="publish-grid">
        <Field label="版本号"><input value={version} onChange={e => setVersion(e.target.value)} /></Field>
        <Field label="分发渠道（多选）">
          <div className="check-list channel-checks">
            {s.channels.map(c => (
              <label key={c.id} className="check-item compact">
                <input type="checkbox" checked={channelIds.includes(c.id)}
                  onChange={e => setChannelIds(ids => e.target.checked ? [...ids, c.id] : ids.filter(x => x !== c.id))} />
                <b>{c.name}</b><small>{c.kind} · {c.region}</small>
              </label>
            ))}
          </div>
        </Field>
      </div>
      <Field label="依赖清单与引用路径（默认沿用上一批，可调整）">
        <DepRowsEditor deps={deps} licenses={activeLicenses} onChange={setDeps} />
      </Field>
      <ErrorLine text={err} />
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" onClick={submit}>发布并生成快照</button></div>
    </Modal>
  );
}

function bumpVersion(v: string): string {
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return v + '-next';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
}
