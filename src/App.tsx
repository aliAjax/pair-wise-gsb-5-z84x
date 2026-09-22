import {useState} from 'react';
import {
  AlertTriangle, Boxes, ChevronDown, FileCode2, Layers3, RotateCcw, ShieldCheck,
  Snowflake, Sparkles,
} from 'lucide-react';
import {StoreProvider, useStore} from './license-lens/store';
import {allUncovered, artifactFrozen} from './license-lens/rules';
import IncidentDesk from './license-lens/pages/IncidentDesk';
import Artifacts from './license-lens/pages/Artifacts';
import Catalog from './license-lens/pages/Catalog';
import './styles.css';

type Page = 'incidents' | 'artifacts' | 'catalog';

function Shell() {
  const {state, reset} = useStore();
  const [page, setPage] = useState<Page>('incidents');
  const open = state.incidents.filter((i) => i.status === 'open');
  const frozen = new Set(
    open.filter((i) => i.type === 'revocation').map((i) => i.artifactId),
  ).size;

  const nav: {key: Page; icon: React.ReactNode; label: string; badge?: number; red?: boolean}[] = [
    {key: 'incidents', icon: <AlertTriangle size={16}/>, label: '事故回滚台', badge: open.length, red: open.length > 0},
    {key: 'artifacts', icon: <Boxes size={16}/>, label: '发行登记产物', badge: frozen, red: false},
    {key: 'catalog', icon: <Layers3 size={16}/>, label: '依赖许可证清单', badge: state.deps.length},
  ];

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <div className="brand-icon"><ShieldCheck size={18}/></div>
          <div><b>License Lens</b><small>rollback console</small></div>
        </div>
        <div className="nav-title">RESPONSE</div>
        {nav.map((n) => (
          <button key={n.key} className={`nav${page === n.key ? ' active' : ''}`} onClick={() => setPage(n.key)}>
            {n.icon}{n.label}
            {n.badge !== undefined && n.badge > 0 && <span className={n.red ? 'red' : ''}>{n.badge}</span>}
          </button>
        ))}
        <div className="aside-bottom">
          <div className="mini-card">
            <Snowflake size={16}/>
            <div><b>{frozen} 个产物冻结中</b><small>事故解除后自动恢复发布通道</small></div>
          </div>
          <div className="mini-card ghost">
            <Sparkles size={16}/>
            <div>
              <b>数据本地持久化</b>
              <small>刷新后事故 / 冻结 / 快照 / 覆盖保持一致 · <button className="link" onClick={reset}>重置演示数据</button></small>
            </div>
          </div>
          <div className="user"><div className="avatar">ZL</div><span>Zen Li</span><ChevronDown size={14}/></div>
        </div>
      </aside>
      <main>
        <header className="top-head">
          <div>
            <div className="crumb">RESPONSE / <b>{page === 'incidents' ? 'INCIDENT DESK' : page === 'artifacts' ? 'RELEASE REGISTRY' : 'DEPENDENCY CATALOG'}</b></div>
            <h1>{page === 'incidents' ? '分发后许可证事故回滚台' : page === 'artifacts' ? '发行登记' : '依赖许可证清单'}</h1>
            <p>{page === 'incidents'
              ? '撤回只回退到最近合规快照；替代依赖覆盖全部原引用路径后，整批方可恢复。'
              : page === 'artifacts'
                ? '管理登记产物、批次、渠道与召回联系人。'
                : '许可证撤销在此立案，波及批次自动冻结。'}</p>
          </div>
          <ConsistencyPill/>
        </header>
        {page === 'incidents' && <IncidentDesk/>}
        {page === 'artifacts' && <Artifacts/>}
        {page === 'catalog' && <Catalog/>}
      </main>
    </div>
  );
}

/** 一致性自检徽标：开放事故、冻结产物、待撤回批次、未覆盖路径数量始终同源重算 */
function ConsistencyPill() {
  const {state} = useStore();
  const open = state.incidents.filter((i) => i.status === 'open');
  const rolledPending = open.reduce(
    (n, i) => n + (i.type === 'revocation' ? i.batchIds.filter((b) => !i.rollbacks[b]).length : 0), 0);
  const uncovered = open.reduce((n, i) => n + allUncovered(i).length, 0);
  const frozen = open.some((i) => i.type === 'revocation' &&
    state.artifacts.some((a) => a.id === i.artifactId && artifactFrozen(state, a.id)));
  const busy = open.length > 0;
  return (
    <div className={`pill ${busy ? 'pill-busy' : 'pill-ok'}`}>
      <RotateCcw size={13}/>
      <span>刷新一致：{open.length} 事故 · {frozen ? '已冻结' : '无冻结'} · {rolledPending} 待撤回 · {uncovered} 未覆盖</span>
      <FileCode2 size={13} className="pill-check"/>
    </div>
  );
}

export default function App() {
  return <StoreProvider><Shell/></StoreProvider>;
}
