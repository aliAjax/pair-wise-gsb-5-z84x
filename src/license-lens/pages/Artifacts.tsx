import {useMemo, useState} from 'react';
import {
  AlertTriangle, Boxes, Building2, Camera, History, Layers, Lock, PackagePlus, Plus, Radio, Send, Users, X,
} from 'lucide-react';
import {useStore, type PublishInput} from '../store';
import {
  artifactFrozen, batchPhase, canPublish, findDep, findSnapshot, isRevoked, manifestCompliant,
  openIncidentFor,
} from '../rules';
import type {Artifact, Batch, ChannelType, Dep} from '../types';
import {Badge, Banner, Btn, Empty, Field, Modal, inputCls} from '../ui/widgets';
import {fmtDate, relDate} from '../ui/format';

const CHANNEL_TYPES: ChannelType[] = ['npm', 'cdn', 'docker', 'appstore', 'internal'];
const channelName: Record<ChannelType, string> = {
  npm: 'npm', cdn: 'CDN', docker: 'Docker', appstore: '应用市场', internal: '内部制品库',
};

export default function Artifacts() {
  const {state} = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(state.artifacts[0]?.id ?? null);
  const [register, setRegister] = useState(false);
  const selected = state.artifacts.find((a) => a.id === selectedId) ?? null;

  return (
    <div>
      <div className="page-bar">
        <div className="page-bar-titles">
          <h1>发行登记产物</h1>
          <p>登记产物、发行批次、分发渠道与召回联系人；事故未解除前发布入口保持关闭。</p>
        </div>
        <Btn variant="primary" onClick={() => setRegister(true)}><PackagePlus size={15}/>登记产物</Btn>
      </div>

      <div className="split split-l">
        <div className="card">
          <div className="card-head"><h2>产物目录</h2><span className="card-sub">{state.artifacts.length} 个登记产物</span></div>
          <div className="art-list">
            {state.artifacts.map((a) => {
              const frozen = artifactFrozen(state, a.id);
              const open = openIncidentFor(state, a.id);
              return (
                <button key={a.id} className={`art-row${a.id === selectedId ? ' active' : ''}`} onClick={() => setSelectedId(a.id)}>
                  <div className="art-ic"><Boxes size={16}/></div>
                  <div className="art-main">
                    <b>{a.name}</b>
                    <span>{a.code} · {a.owner}</span>
                  </div>
                  <div className="art-tags">
                    {frozen ? <Badge tone="blue"><Lock size={10}/> 已冻结</Badge>
                      : open ? <Badge tone="orange">事故待处置</Badge>
                      : <Badge tone="teal">可发布</Badge>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="card detail-card">
          {selected
            ? <ArtifactDetail key={selected.id} artifact={selected} onChanged={() => setSelectedId(selected.id)}/>
            : <Empty>尚未登记产物</Empty>}
        </div>
      </div>

      {register && <RegisterModal onClose={() => setRegister(false)}/>}
    </div>
  );
}

function ArtifactDetail({artifact}: {artifact: Artifact; onChanged: () => void}) {
  const {state} = useStore();
  const [publishing, setPublishing] = useState(false);
  const batches = state.batches
    .filter((b) => b.artifactId === artifact.id)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const frozen = artifactFrozen(state, artifact.id);
  const open = openIncidentFor(state, artifact.id);
  const gate = canPublish(state, artifact.id);
  const [violating, setViolating] = useState(false);

  return (
    <div className="inc-detail">
      <div className="detail-title">
        <div>
          <span className="eyebrow">REGISTERED ARTIFACT</span>
          <h2>{artifact.name}</h2>
          <p>{artifact.code} · 责任团队 {artifact.owner}</p>
        </div>
        <div className="detail-badges">
          {frozen ? <Badge tone="blue"><Lock size={10}/> 许可证撤销 · 产物冻结</Badge>
            : open ? <Badge tone="orange">事故未解除 · 停止发布</Badge>
            : <Badge tone="teal">发布通道开放</Badge>}
        </div>
      </div>

      {!gate.ok && (
        <Banner tone="red" title="发布闸门关闭">
          <p>{gate.reason}。同产物只允许存在一条待处置事故，解除后才能发布新批次。</p>
        </Banner>
      )}

      <div className="detail-columns">
        <section>
          <div className="sub-head"><Users size={14}/><h3>召回联系人</h3></div>
          <div className="contact-list">
            {artifact.contacts.length === 0 && <small className="muted">未登记召回联系人</small>}
            {artifact.contacts.map((c) => (
              <div className="contact" key={c.id}>
                <div className="avatar sm">{c.name.slice(0, 1)}</div>
                <div><b>{c.name}</b><span>{c.role} · {c.channel}</span></div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="sub-head"><Building2 size={14}/><h3>分发概况</h3></div>
          <div className="kv-mini">
            <div><label>已发行批次</label><b>{batches.length}</b></div>
            <div><label>合规快照</label>
              <b>{state.snapshots.filter((s) => s.artifactId === artifact.id && s.compliant).length}</b></div>
            <div><label>分发渠道（在役）</label>
              <b>{new Set(batches.filter((b) => batchPhase(state, b) === 'normal').flatMap((b) => b.channels.map((c) => c.name))).size}</b></div>
          </div>
        </section>
      </div>

      <div className="sub-head"><Layers size={14}/><h3>批次与渠道</h3>
        <span className="spacer"/>
        {!open && batches.length > 0 && (
          <Btn variant="ghost" size="sm" onClick={() => setViolating(true)}>
            <AlertTriangle size={13}/> 登记分发违规
          </Btn>
        )}
        <Btn variant="primary" size="sm" disabled={!gate.ok} onClick={() => setPublishing(true)}>
          <Send size={13}/> 发布新批次
        </Btn>
      </div>
      <div className="batch-cards">
        {batches.map((b) => <BatchCard key={b.id} batch={b}/>)}
        {batches.length === 0 && <Empty>尚无发行批次</Empty>}
      </div>

      {publishing && <PublishModal artifact={artifact} onClose={() => setPublishing(false)}/>}
      {violating && <ViolationModal artifact={artifact} onClose={() => setViolating(false)}/>}
    </div>
  );
}

const phaseText = {
  frozen: {tone: 'red' as const, text: '冻结中'},
  rolledback: {tone: 'orange' as const, text: '已撤回 · 待替代'},
  restored: {tone: 'teal' as const, text: '可恢复（覆盖齐全）'},
  normal: {tone: 'gray' as const, text: '在役'},
};

function BatchCard({batch}: {batch: Batch}) {
  const {state} = useStore();
  const phase = batchPhase(state, batch);
  const snap = findSnapshot(state, batch.publishSnapshotId);
  const compliant = manifestCompliant(state, batch.manifest);
  return (
    <div className={`batch-card phase-${phase}`}>
      <div className="batch-card-top">
        <div className="art-ic"><Camera size={15}/></div>
        <b>版本 {batch.version}</b>
        <span className="muted">{relDate(batch.publishedAt)} 发布</span>
        <span className="spacer"/>
        <Badge tone={phaseText[phase].tone}>{phaseText[phase].text}</Badge>
      </div>
      <div className="chips">
        {batch.channels.map((c) => (
          <span className="chip" key={c.id}><Radio size={11}/>{channelName[c.type]} · {c.name}<code>{c.location}</code></span>
        ))}
      </div>
      <div className="snap-line">
        <History size={12}/>
        <span className="muted">发布快照：{snap?.label}</span>
        {snap?.compliant
          ? <Badge tone="teal">发布时合规</Badge>
          : <Badge tone="orange">发布时即不合规</Badge>}
        {compliant
          ? <Badge tone="teal">当前清单合规</Badge>
          : <Badge tone="red">当前清单不合规</Badge>}
      </div>
      <details className="deps-toggle">
        <summary>依赖清单（{batch.manifest.length}）</summary>
        <div className="manifest-table">
          {batch.manifest.map((m) => {
            const dep = findDep(state, m.depId);
            const revoked = dep && isRevoked(dep);
            return (
              <div className="manifest-row" key={`${m.depId}-${m.paths[0]}`}>
                <b>{m.name}@{m.version}</b>
                <Badge tone={revoked ? 'red' : m.license.match(/GPL|AGPL/i) ? 'orange' : 'blue'}>{m.license}</Badge>
                <code>{m.paths.join('、')}</code>
              </div>
            );
          })}
        </div>
      </details>
    </div>
  );
}

function RegisterModal({onClose}: {onClose: () => void}) {
  const {registerArtifact} = useStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [owner, setOwner] = useState('');
  const [contacts, setContacts] = useState<{name: string; role: string; channel: string}[]>([
    {name: '', role: '发布负责人', channel: ''},
  ]);
  const [err, setErr] = useState('');
  const submit = () => {
    const r = registerArtifact({name, code, owner, contacts});
    if (r.ok) onClose(); else setErr(r.error ?? '登记失败');
  };
  return (
    <Modal title="登记发行产物" onClose={onClose} wide
      footer={<><Btn onClick={onClose}>取消</Btn><Btn variant="primary" onClick={submit}><Plus size={14}/>登记</Btn></>}>
      <div className="form-grid">
        <Field label="产物名称"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 Aurora Mobile"/></Field>
        <Field label="产物编号"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} placeholder="例如 AURORA-MOBILE"/></Field>
        <Field label="责任团队"><input className={inputCls} value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="例如 移动端组"/></Field>
      </div>
      <div className="sub-head"><Users size={13}/><h3>召回联系人</h3>
        <Btn variant="ghost" size="sm" onClick={() => setContacts((cs) => [...cs, {name: '', role: '', channel: ''}])}>
          <Plus size={12}/> 添加
        </Btn>
      </div>
      <div className="contact-forms">
        {contacts.map((c, i) => (
          <div className="contact-form" key={i}>
            <input className={inputCls} placeholder="姓名" value={c.name}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? {...x, name: e.target.value} : x))}/>
            <input className={inputCls} placeholder="角色" value={c.role}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? {...x, role: e.target.value} : x))}/>
            <input className={inputCls} placeholder="邮箱 / 值班渠道" value={c.channel}
              onChange={(e) => setContacts((cs) => cs.map((x, j) => j === i ? {...x, channel: e.target.value} : x))}/>
            <button className="icon-x" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))}><X size={14}/></button>
          </div>
        ))}
      </div>
      {err && <Banner tone="red">{err}</Banner>}
    </Modal>
  );
}

function PublishModal({artifact, onClose}: {artifact: Artifact; onClose: () => void}) {
  const {state, publishBatch} = useStore();
  const [version, setVersion] = useState('');
  const [channels, setChannels] = useState<{type: ChannelType; name: string; location: string}[]>([
    {type: 'cdn', name: '', location: ''},
  ]);
  const [picks, setPicks] = useState<{depId: string; paths: string}[]>([
    {depId: state.deps[0]?.id ?? '', paths: ''},
  ]);
  const [err, setErr] = useState('');

  const preview = useMemo(() => {
    const manifest = picks
      .filter((p) => p.depId && p.paths.trim())
      .map((p) => ({depId: p.depId, paths: p.paths.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)}));
    return manifest.every((m) => {
      const dep = findDep(state, m.depId);
      return dep && !isRevoked(dep) && !/GPL|AGPL/i.test(dep.license);
    }) && manifest.length > 0;
  }, [picks, state]);

  const submit = () => {
    const input: PublishInput = {
      artifactId: artifact.id,
      version,
      channels: channels.filter((c) => c.name.trim() || c.location.trim()),
      manifest: picks
        .filter((p) => p.depId && p.paths.trim())
        .map((p) => ({depId: p.depId, paths: p.paths.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean)})),
    };
    const r = publishBatch(input);
    if (r.ok) onClose(); else setErr(r.error ?? '发布失败');
  };

  return (
    <Modal title={`发布新批次 · ${artifact.name}`} onClose={onClose} wide
      footer={<><Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={submit}><Send size={14}/>登记发行</Btn></>}>
      {!canPublish(state, artifact.id).ok && (
        <Banner tone="red" title="发布闸门关闭"><p>{canPublish(state, artifact.id).reason}</p></Banner>
      )}
      <Field label="版本号">
        <input className={inputCls} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如 1.2.0"/>
      </Field>

      <div className="sub-head"><Radio size={13}/><h3>分发渠道</h3>
        <Btn variant="ghost" size="sm"
          onClick={() => setChannels((cs) => [...cs, {type: 'npm', name: '', location: ''}])}>
          <Plus size={12}/> 添加渠道
        </Btn>
      </div>
      <div className="contact-forms">
        {channels.map((c, i) => (
          <div className="contact-form" key={i}>
            <select className={inputCls} value={c.type}
              onChange={(e) => setChannels((cs) => cs.map((x, j) => j === i ? {...x, type: e.target.value as ChannelType} : x))}>
              {CHANNEL_TYPES.map((t) => <option key={t} value={t}>{channelName[t]}</option>)}
            </select>
            <input className={inputCls} placeholder="渠道名称" value={c.name}
              onChange={(e) => setChannels((cs) => cs.map((x, j) => j === i ? {...x, name: e.target.value} : x))}/>
            <input className={inputCls} placeholder="分发位置 / 坐标" value={c.location}
              onChange={(e) => setChannels((cs) => cs.map((x, j) => j === i ? {...x, location: e.target.value} : x))}/>
            <button className="icon-x" onClick={() => setChannels((cs) => cs.filter((_, j) => j !== i))}><X size={14}/></button>
          </div>
        ))}
      </div>

      <div className="sub-head"><Layers size={13}/><h3>依赖清单与引用路径</h3>
        <Btn variant="ghost" size="sm" onClick={() => setPicks((p) => [...p, {depId: state.deps[0]?.id ?? '', paths: ''}])}>
          <Plus size={12}/> 添加依赖
        </Btn>
      </div>
      <div className="pick-rows">
        {picks.map((p, i) => {
          const dep: Dep | undefined = state.deps.find((d) => d.id === p.depId);
          const bad = dep && (isRevoked(dep) || /GPL|AGPL/i.test(dep.license));
          return (
            <div className="pick-row" key={i}>
              <select className={inputCls} value={p.depId}
                onChange={(e) => setPicks((ps) => ps.map((x, j) => j === i ? {...x, depId: e.target.value} : x))}>
                {state.deps.map((d) => <option key={d.id} value={d.id}>
                  {d.name}@{d.version} · {d.license}{isRevoked(d) ? '（已撤销）' : ''}</option>)}
              </select>
              <input className={inputCls} placeholder="引用路径，逗号分隔，如 src/a.ts, src/b.ts" value={p.paths}
                onChange={(e) => setPicks((ps) => ps.map((x, j) => j === i ? {...x, paths: e.target.value} : x))}/>
              {bad ? <Badge tone="red">不能发行</Badge> : <Badge tone="teal">合规</Badge>}
              <button className="icon-x" onClick={() => setPicks((ps) => ps.filter((_, j) => j !== i))}><X size={14}/></button>
            </div>
          );
        })}
      </div>
      {preview
        ? <Banner tone="teal" title="本次发布将留存合规快照"/>
        : <Banner tone="orange" title="本次清单不合规：即使登记成功，也不会产生合规快照，事故撤回时无可回退点"/>}
      {err && <Banner tone="red">{err}</Banner>}
    </Modal>
  );
}

function ViolationModal({artifact, onClose}: {artifact: Artifact; onClose: () => void}) {
  const {state, reportViolation} = useStore();
  const batches = state.batches
    .filter((b) => b.artifactId === artifact.id)
    .sort((a, b) => b.publishedAt - a.publishedAt);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [batchIds, setBatchIds] = useState<string[]>(batches.slice(0, 1).map((b) => b.id));
  const [err, setErr] = useState('');

  const toggle = (id: string) =>
    setBatchIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  const submit = () => {
    const r = reportViolation({artifactId: artifact.id, batchIds, title, detail});
    if (r.ok) onClose(); else setErr(r.error ?? '登记失败');
  };

  return (
    <Modal title={`登记分发违规 · ${artifact.name}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>取消</Btn>
        <Btn variant="primary" onClick={submit}><AlertTriangle size={14}/>立案</Btn></>}>
      <Banner tone="orange" title="通用违规事故">
        <p>不冻结产物，但同产物只保留一条待处置事故，解除前新批次发布入口关闭。</p>
      </Banner>
      <Field label="事故标题"><input className={inputCls} value={title}
        onChange={(e) => setTitle(e.target.value)} placeholder="例如：NOTICE 文件遗漏 BSD 版权声明"/></Field>
      <Field label="详情"><textarea className={inputCls} rows={2} value={detail}
        onChange={(e) => setDetail(e.target.value)} placeholder="违规事实与影响范围"/></Field>
      <div className="field"><span>涉事批次</span>
        <div className="pick-batches">
          {batches.map((b) => (
            <label key={b.id} className={`pick-batch${batchIds.includes(b.id) ? ' on' : ''}`}>
              <input type="checkbox" checked={batchIds.includes(b.id)} onChange={() => toggle(b.id)}/>
              {b.version} <small>{fmtDate(b.publishedAt)}</small>
            </label>
          ))}
        </div>
      </div>
      {err && <Banner tone="red">{err}</Banner>}
    </Modal>
  );
}
