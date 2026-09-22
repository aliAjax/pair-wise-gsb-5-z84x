// 页面：分发渠道 / 召回联系人 / 许可证台账 / 审计日志

import { useState } from 'react';
import {
  BookMarked, Globe2, Plus, Radio, ScrollText, UserRound, RotateCcw,
} from 'lucide-react';
import { addChannel, addContact, reseed, useStore } from '../store';
import { Badge, Empty, ErrorLine, Field, Modal, fmtDate } from './shared';
import { PageHead } from './incidents';

type Tab = 'channels' | 'contacts' | 'licenses' | 'logs';

export default function RegistryPage() {
  const s = useStore();
  const [tab, setTab] = useState<Tab>('channels');
  const [showChannel, setShowChannel] = useState(false);
  const [showContact, setShowContact] = useState(false);

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'channels', label: '分发渠道', icon: <Radio size={14} />, count: s.channels.length },
    { id: 'contacts', label: '召回联系人', icon: <UserRound size={14} />, count: s.contacts.length },
    { id: 'licenses', label: '许可证台账', icon: <BookMarked size={14} />, count: s.licenses.length },
    { id: 'logs', label: '审计日志', icon: <ScrollText size={14} />, count: s.logs.length },
  ];

  return (
    <div>
      <PageHead
        title="渠道与召回台账"
        desc="维护分发渠道、召回联系人、许可证状态与全量处置审计；撤回、回滚、恢复都可追溯。"
        actions={
          tab === 'channels'
            ? <button className="primary" onClick={() => setShowChannel(true)}><Plus size={15} />登记渠道</button>
            : tab === 'contacts'
              ? <button className="primary" onClick={() => setShowContact(true)}><Plus size={15} />登记联系人</button>
              : undefined
        }
      />

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'tab active' : 'tab'} onClick={() => setTab(t.id)}>
            {t.icon}{t.label}<span>{t.count}</span>
          </button>
        ))}
        <button className="tab reset" onClick={() => { if (window.confirm('重置为初始演示数据？当前改动会被清除。')) reseed(); }}>
          <RotateCcw size={13} />重置演示数据
        </button>
      </div>

      {tab === 'channels' && (
        <div className="card-grid">
          {s.channels.map(c => (
            <div key={c.id} className="reg-card">
              <div className="reg-top"><span className="reg-ic"><Globe2 size={16} /></span><b>{c.name}</b></div>
              <div className="reg-meta">
                <span>{c.kind}</span><span>{c.region}</span>
              </div>
              <div className="reg-foot"><label>对接邮箱</label><span className="mono">{c.contact}</span><span className="mono small">{c.id}</span></div>
            </div>
          ))}
          {s.channels.length === 0 && <Empty text="还没有渠道" />}
        </div>
      )}

      {tab === 'contacts' && (
        <div className="card-grid">
          {s.contacts.map(c => (
            <div key={c.id} className="reg-card">
              <div className="reg-top"><span className="reg-ic avatar-ic">{c.name.slice(0, 1)}</span><b>{c.name}</b><Badge tone="orange">SLA {c.slaHours}h</Badge></div>
              <div className="reg-meta"><span>{c.role}</span></div>
              <div className="reg-foot"><label>召回联络</label><span className="mono">{c.email}</span><span>{c.phone}</span></div>
            </div>
          ))}
          {s.contacts.length === 0 && <Empty text="还没有召回联系人" />}
        </div>
      )}

      {tab === 'licenses' && (
        <div className="table-pane">
          <div className="table">
            <div className="tr th license-th"><span>许可证</span><span>状态</span><span>撤销时间</span><span>备注</span></div>
            {s.licenses.map(l => (
              <div key={l.name} className="tr">
                <span className="dep-name">{l.name}</span>
                <span>{l.status === 'active' ? <Badge tone="teal">有效</Badge> : <Badge tone="red">已撤销</Badge>}</span>
                <span className="muted">{l.revokedAt ? fmtDate(l.revokedAt) : '—'}</span>
                <span className="muted">{l.note ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="table-pane">
          <div className="log-list">
            {s.logs.map(l => (
              <div key={l.id} className="log-row">
                <span className="log-time mono">{fmtDate(l.at)}</span>
                <Badge tone={l.action.includes('撤销') || l.action.includes('撤回') ? 'red' : l.action.includes('解除') || l.action.includes('恢复') ? 'teal' : 'blue'}>{l.action}</Badge>
                <span className="log-detail">{l.detail}</span>
              </div>
            ))}
            {s.logs.length === 0 && <Empty text="还没有审计日志" />}
          </div>
        </div>
      )}

      {showChannel && <ChannelModal onClose={() => setShowChannel(false)} />}
      {showContact && <ContactModal onClose={() => setShowContact(false)} />}
    </div>
  );
}

function ChannelModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('Web');
  const [region, setRegion] = useState('全球');
  const [contact, setContact] = useState('');
  const [err, setErr] = useState<string>();
  return (
    <Modal title="登记分发渠道" onClose={onClose} width={440}>
      <Field label="渠道名称"><input value={name} onChange={e => setName(e.target.value)} placeholder="例如 镜像源-EU" /></Field>
      <div className="form-row">
        <Field label="类型">
          <select value={kind} onChange={e => setKind(e.target.value)}>
            {['Web', 'Registry', 'Store', 'CDN', 'Partner'].map(k => <option key={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="地区"><input value={region} onChange={e => setRegion(e.target.value)} /></Field>
      </div>
      <Field label="对接邮箱"><input value={contact} onChange={e => setContact(e.target.value)} placeholder="ops@example.com" /></Field>
      <ErrorLine text={err} />
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" onClick={() => { const r = addChannel({ name, kind, region, contact }); if (!r.ok) setErr(r.error); else onClose(); }}>登记</button></div>
    </Modal>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [slaHours, setSlaHours] = useState(4);
  const [err, setErr] = useState<string>();
  return (
    <Modal title="登记召回联系人" onClose={onClose} width={440}>
      <div className="form-row">
        <Field label="姓名"><input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="角色"><input value={role} onChange={e => setRole(e.target.value)} placeholder="法务 / 分发负责人" /></Field>
      </div>
      <Field label="邮箱"><input value={email} onChange={e => setEmail(e.target.value)} placeholder="legal@example.com" /></Field>
      <div className="form-row">
        <Field label="电话"><input value={phone} onChange={e => setPhone(e.target.value)} /></Field>
        <Field label="响应 SLA（小时）">
          <select value={slaHours} onChange={e => setSlaHours(Number(e.target.value))}>
            {[1, 2, 4, 8, 24].map(h => <option key={h} value={h}>{h} 小时</option>)}
          </select>
        </Field>
      </div>
      <ErrorLine text={err} />
      <div className="modal-actions"><button className="outline" onClick={onClose}>取消</button>
        <button className="primary full" onClick={() => { const r = addContact({ name, role, email, phone, slaHours }); if (!r.ok) setErr(r.error); else onClose(); }}>登记</button></div>
    </Modal>
  );
}
