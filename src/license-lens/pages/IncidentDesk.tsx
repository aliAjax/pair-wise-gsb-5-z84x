import {useMemo, useState} from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronRight, History, RotateCcw, ShieldAlert, Snowflake,
  Waypoints, Wrench,
} from 'lucide-react';
import {useStore} from '../store';
import {
  allRolledBack, allUncovered, artifactFrozen, findArtifact, findBatch, findDep, findSnapshot,
  incidentBatches, isBatchRolledBack, latestCompliantSnapshot, replacementCandidates, restoreCheck,
  rollbackSnapshot, rollbackTarget, uncoveredPaths,
} from '../rules';
import type {Incident} from '../types';
import {Badge, Banner, Btn, Empty, Field, Modal, inputCls} from '../ui/widgets';
import {fmtDate, relDate} from '../ui/format';

export default function IncidentDesk() {
  const {state} = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(
    state.incidents.find((i) => i.status === 'open')?.id ?? state.incidents[0]?.id ?? null,
  );
  const selected = state.incidents.find((i) => i.id === selectedId) ?? null;

  const open = state.incidents.filter((i) => i.status === 'open');
  const resolved = state.incidents.filter((i) => i.status === 'resolved');
  const frozenCount = new Set(
    open.filter((i) => i.type === 'revocation').map((i) => i.artifactId),
  ).size;
  const pendingRollback = open
    .filter((i) => i.type === 'revocation')
    .reduce((n, i) => n + i.batchIds.filter((b) => !i.rollbacks[b]).length, 0);
  const uncovered = open.reduce((n, i) => n + allUncovered(i).length, 0);

  return (
    <div>
      <div className="stat-row">
        <StatCard icon={<AlertTriangle size={16}/>} tone="red" label="待处置事故" value={open.length} hint="同产物同时仅保留一条"/>
        <StatCard icon={<Snowflake size={16}/>} tone="blue" label="冻结产物" value={frozenCount} hint="许可证撤销触发"/>
        <StatCard icon={<RotateCcw size={16}/>} tone="orange" label="待撤回批次" value={pendingRollback} hint="须回退到最近合规快照"/>
        <StatCard icon={<Waypoints size={16}/>} tone="purple" label="未覆盖引用路径" value={uncovered} hint="覆盖完成才可恢复"/>
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <h2>事故队列</h2>
            <span className="card-sub">发布闸门：待处置事故解除前不得发布新批次</span>
          </div>
          {open.length === 0 && resolved.length === 0 && <Empty>暂无事故</Empty>}
          <div className="inc-list">
            {open.map((i) => <IncRow key={i.id} incident={i} active={i.id === selectedId} onPick={setSelectedId}/>)}
            {resolved.length > 0 && (
              <div className="inc-section"><History size={12}/> 已解除（{resolved.length}）</div>
            )}
            {resolved.map((i) => <IncRow key={i.id} incident={i} active={i.id === selectedId} onPick={setSelectedId}/>)}
          </div>
        </div>
        <div className="card detail-card">
          {selected
            ? <IncidentDetail key={selected.id} incident={selected}/>
            : <Empty>从左侧选择一条事故查看处置台</Empty>}
        </div>
      </div>
    </div>
  );
}

function StatCard({icon, tone, label, value, hint}:
  {icon: React.ReactNode; tone: 'red'|'blue'|'orange'|'purple'; label: string; value: number; hint: string}) {
  return (
    <div className="stat-card">
      <div className={`stat-ic stat-${tone}`}>{icon}</div>
      <div><span>{label}</span><b>{value}</b><small>{hint}</small></div>
    </div>
  );
}

function IncRow({incident, active, onPick}: {incident: Incident; active: boolean; onPick: (id: string) => void}) {
  const {state} = useStore();
  const artifact = findArtifact(state, incident.artifactId);
  const frozen = incident.status === 'open' && artifactFrozen(state, incident.artifactId);
  const uncovered = incident.type === 'revocation' ? allUncovered(incident).length : 0;
  return (
    <button className={`inc-row${active ? ' active' : ''}`} onClick={() => onPick(incident.id)}>
      <div className="inc-row-top">
        {incident.status === 'open'
          ? <ShieldAlert size={15} className={incident.type === 'revocation' ? 'ic-red' : 'ic-orange'}/>
          : <CheckCircle2 size={15} className="ic-teal"/>}
        <b>{incident.title}</b>
        <ChevronRight size={14} className="chev"/>
      </div>
      <div className="inc-row-meta">
        <span>{artifact?.name ?? incident.artifactId}</span>
        <span>{incident.batchIds.length} 个批次</span>
        <span>{relDate(incident.createdAt)}</span>
        <span className="spacer"/>
        {incident.status === 'open'
          ? incident.type === 'revocation'
            ? <>{frozen && <Badge tone="blue">已冻结</Badge>}{uncovered > 0 && <Badge tone="purple">缺覆盖 {uncovered}</Badge>}</>
            : <Badge tone="orange">违规待整改</Badge>
          : <Badge tone="teal">已解除</Badge>}
      </div>
    </button>
  );
}

function IncidentDetail({incident}: {incident: Incident}) {
  const {state} = useStore();
  const artifact = findArtifact(state, incident.artifactId);
  const batches = incidentBatches(state, incident);

  return (
    <div className="inc-detail">
      <div className="detail-title">
        <div>
          <span className="eyebrow">
            {incident.type === 'revocation' ? 'LICENSE REVOCATION · 许可证撤销' : 'DISTRIBUTION VIOLATION · 分发违规'}
          </span>
          <h2>{incident.title}</h2>
          <p>{incident.detail}</p>
        </div>
        <div className="detail-badges">
          {incident.status === 'open'
            ? <Badge tone="red">待处置</Badge>
            : <Badge tone="teal">已解除 · {relDate(incident.resolvedAt ?? 0)}</Badge>}
          {incident.status === 'open' && incident.type === 'revocation' && <Badge tone="blue">产物冻结中</Badge>}
        </div>
      </div>

      <div className="kv-grid">
        <div><label>登记产物</label><b>{artifact?.name}（{artifact?.code}）</b></div>
        <div><label>责任团队</label><b>{artifact?.owner}</b></div>
        <div><label>立案时间</label><b>{fmtDate(incident.createdAt)}</b></div>
        <div>
          <label>召回联系人</label>
          <b>{artifact?.contacts.map((c) => `${c.name} · ${c.channel}`).join('；') || '未登记'}</b>
        </div>
      </div>

      {incident.type === 'revocation'
        ? <RevocationFlow incident={incident}/>
        : <ViolationFlow incident={incident}/>}

      {incident.status === 'resolved' && (
        <Banner tone="teal" title="处置结论">
          <p>{incident.resolution}</p>
          {incident.type === 'revocation' && Object.entries(incident.rollbacks).map(([bid, snapId]) => {
            const b = findBatch(state, bid); const s = findSnapshot(state, snapId);
            return <p key={bid} className="muted">批次 {b?.version} 曾回退至合规快照：{s?.label}</p>;
          })}
          <p className="muted">解除时间 {fmtDate(incident.resolvedAt)}；冻结已解除，可发布新批次。</p>
        </Banner>
      )}
    </div>
  );
}

function RevocationFlow({incident}: {incident: Incident}) {
  const {state} = useStore();
  const batches = incidentBatches(state, incident);
  const rolled = allRolledBack(incident);
  const missing = allUncovered(incident);
  const check = restoreCheck(state, incident);

  return (
    <div className="flow">
      <Step n={1} title="撤回已发行批次" done={rolled}
        doneText={`${batches.length}/${batches.length} 批次已撤回`}
        todo={`${batches.filter((b) => !isBatchRolledBack(incident, b.id)).length} 个批次待撤回`}>
        <p className="step-note">撤回只回退到最近合规快照，并必须填写撤回原因。</p>
        <div className="batch-lines">
          {batches.map((b) => <RollbackLine key={b.id} incident={incident} batchId={b.id}/>)}
        </div>
      </Step>

      <Step n={2} title="用替代依赖覆盖原引用路径" done={missing.length === 0}
        doneText={`${incident.replacements.length}/${incident.affected.reduce((n, a) => n + a.paths.length, 0)} 条路径已覆盖`}
        todo={`${missing.length} 条引用路径未覆盖`}>
        <p className="step-note">替代依赖必须来自当前合规目录；原引用路径一条都不能漏。</p>
        <div className="cover-list">
          {incident.affected.map((a) => <CoverageBlock key={a.depId} incident={incident} depId={a.depId}/>)}
        </div>
      </Step>

      <Step n={3} title="整批恢复并解除事故" done={incident.status === 'resolved'}
        doneText="恢复快照已重建，事故解除" todo={check.ok ? '校验通过，可恢复' : '前置条件未满足'}>
        {incident.status === 'open' && <>
          {check.ok
            ? <Banner tone="teal" title="一致性校验通过">
                <p>全部批次已回退到合规快照，{incident.replacements.length} 条原引用路径均已覆盖；恢复后清单合规。</p>
              </Banner>
            : <Banner tone="red" title="整批暂不能恢复">
                <ul>{check.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              </Banner>}
          <RestoreButton incident={incident} ready={check.ok}/>
        </>}
      </Step>
    </div>
  );
}

function Step({n, title, done, doneText, todo, children}:
  {n: number; title: string; done: boolean; doneText: string; todo: string; children: React.ReactNode}) {
  return (
    <section className={`step${done ? ' done' : ''}`}>
      <div className="step-head">
        <span className="step-n">{done ? <CheckCircle2 size={15}/> : n}</span>
        <h3>{title}</h3>
        <Badge tone={done ? 'teal' : 'orange'}>{done ? doneText : todo}</Badge>
      </div>
      <div className="step-body">{children}</div>
    </section>
  );
}

function RollbackLine({incident, batchId}: {incident: Incident; batchId: string}) {
  const {state, rollback} = useStore();
  const [openModal, setOpenModal] = useState(false);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const batch = findBatch(state, batchId);
  const snapId = incident.rollbacks[batchId];
  const target = latestCompliantSnapshot(state, incident.artifactId, batchId);
  const check = rollbackTarget(state, incident, batchId);
  const rollbackSnap = rollbackSnapshot(state, incident, batchId);

  if (!batch) return null;

  const submit = () => {
    const r = rollback(incident.id, batchId, reason);
    if (r.ok) { setOpenModal(false); setReason(''); setErr(''); }
    else setErr(r.error ?? '撤回失败');
  };

  return (
    <div className="batch-line">
      <div className="batch-line-main">
        <b>{batch.version}</b>
        <span className="muted">{batch.channels.map((c) => c.name).join(' · ') || '无渠道'}</span>
        <span className="spacer"/>
        {snapId
          ? <Badge tone="teal">已撤回 → {findSnapshot(state, snapId)?.label}</Badge>
          : target
            ? <Badge tone="orange">待撤回（最近合规：{target.label}）</Badge>
            : <Badge tone="red">无合规快照可回退</Badge>}
      </div>
      {!snapId && (
        <Btn variant="outline" size="sm" disabled={!check.ok} onClick={() => setOpenModal(true)}>
          <RotateCcw size={13}/> 撤回到合规快照
        </Btn>
      )}
      {rollbackSnap?.reason && (
        <small className="muted rollback-reason">撤回原因：{rollbackSnap.reason}</small>
      )}
      {openModal && (
        <Modal title={`撤回批次 ${batch.version}`} onClose={() => setOpenModal(false)}
          footer={<><Btn onClick={() => setOpenModal(false)}>取消</Btn>
            <Btn variant="primary" onClick={submit}><RotateCcw size={14}/> 确认撤回</Btn></>}>
          <Banner tone="orange" title="回退目标">
            <p>最近合规快照：<b>{target?.label}</b>（{fmtDate(target?.at)}）。撤回后该批次生效清单将替换为该快照内容。</p>
          </Banner>
          <Field label="撤回原因（必填）">
            <textarea className={inputCls} rows={3} value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：上游 GPL-3.0 授权撤销，依应急流程 S-17 回退"/>
          </Field>
          {err && <Banner tone="red">{err}</Banner>}
        </Modal>
      )}
    </div>
  );
}

function CoverageBlock({incident, depId}: {incident: Incident; depId: string}) {
  const {state, setReplacement} = useStore();
  const dep = findDep(state, depId);
  const affected = incident.affected.find((a) => a.depId === depId);
  const candidates = useMemo(() => replacementCandidates(state, depId), [state, depId]);
  if (!affected || !dep) return null;
  const remaining = uncoveredPaths(incident, depId);

  return (
    <div className="cover-block">
      <div className="cover-head">
        <b>{affected.name}@{affected.version}</b>
        <Badge tone="red">{affected.license} · 已撤销</Badge>
        <span className="spacer"/>
        <Badge tone={remaining.length === 0 ? 'teal' : 'purple'}>
          {affected.paths.length - remaining.length}/{affected.paths.length} 路径覆盖
        </Badge>
      </div>
      <div className="path-rows">
        {affected.paths.map((path) => {
          const chosen = incident.replacements.find((r) => r.depId === depId && r.path === path);
          const target = chosen ? findDep(state, chosen.targetDepId) : undefined;
          return (
            <div className="path-row" key={path}>
              <code>{path}</code>
              <span className="arrow">→</span>
              <select className={inputCls}
                value={chosen?.targetDepId ?? ''}
                onChange={(e) => setReplacement(incident.id, depId, path, e.target.value || null)}>
                <option value="">选择替代依赖…</option>
                {candidates.map((c) =>
                  <option key={c.id} value={c.id}>{c.name}@{c.version} · {c.license}</option>)}
              </select>
              {target
                ? <Badge tone="teal">{target.name} · 合规</Badge>
                : <Badge tone="purple">未覆盖</Badge>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RestoreButton({incident, ready}: {incident: Incident; ready: boolean}) {
  const {restore} = useStore();
  const [openModal, setOpenModal] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const submit = () => {
    const r = restore(incident.id, note);
    if (r.ok) { setOpenModal(false); setNote(''); setErr(''); }
    else setErr(r.error ?? '恢复失败');
  };
  return (
    <div className="restore-row">
      <Btn variant="danger" disabled={!ready} onClick={() => setOpenModal(true)}>
        <Wrench size={14}/> 替代齐全，整批恢复
      </Btn>
      {!ready && <small className="muted">替代依赖未覆盖全部原引用路径时，按钮不可用。</small>}
      {openModal && (
        <Modal title="整批恢复" onClose={() => setOpenModal(false)}
          footer={<><Btn onClick={() => setOpenModal(false)}>取消</Btn>
            <Btn variant="primary" onClick={submit}>确认恢复并解除事故</Btn></>}>
          <Banner tone="teal" title="将执行">
            <p>为 {incident.batchIds.length} 个批次在合规快照之上按原引用路径落入替代依赖，生成恢复快照，解除事故并解冻产物。</p>
          </Banner>
          <Field label="恢复说明（必填）">
            <textarea className={inputCls} rows={3} value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如：legacy-parser 已全部替换为 modern-parser，渠道镜像同步完成"/>
          </Field>
          {err && <Banner tone="red">{err}</Banner>}
        </Modal>
      )}
    </div>
  );
}

function ViolationFlow({incident}: {incident: Incident}) {
  const {resolveViolation} = useStore();
  const [openModal, setOpenModal] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  if (incident.status === 'resolved') return null;
  const submit = () => {
    const r = resolveViolation(incident.id, note);
    if (r.ok) { setOpenModal(false); setNote(''); setErr(''); }
    else setErr(r.error ?? '操作失败');
  };
  return (
    <div className="flow">
      <Banner tone="orange" title="分发违规事故">
        <p>不涉及许可证撤销、不冻结产物，但事故解除前同样不得发布新批次。完成整改后填写说明即可解除。</p>
      </Banner>
      <Btn variant="primary" onClick={() => setOpenModal(true)}>
        <CheckCircle2 size={14}/> 整改完成，解除事故
      </Btn>
      {openModal && (
        <Modal title="解除违规事故" onClose={() => setOpenModal(false)}
          footer={<><Btn onClick={() => setOpenModal(false)}>取消</Btn>
            <Btn variant="primary" onClick={submit}>确认解除</Btn></>}>
          <Field label="整改说明（必填）">
            <textarea className={inputCls} rows={3} value={note}
              onChange={(e) => setNote(e.target.value)} placeholder="说明整改措施与证据"/>
          </Field>
          {err && <Banner tone="red">{err}</Banner>}
        </Modal>
      )}
    </div>
  );
}
