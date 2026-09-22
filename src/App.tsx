import {useState} from 'react';
import {
  BookMarked, ChevronDown, Layers3, Rocket, ShieldCheck, Siren, Snowflake,
} from 'lucide-react';
import IncidentsPage from './ui/incidents';
import ReleasesPage from './ui/releases';
import RegistryPage from './ui/registry';
import { isArtifactFrozen } from './rules';
import { useStore } from './store';

type View = 'incidents' | 'releases' | 'registry';

export default function App(){
  const s = useStore();
  const [view, setView] = useState<View>('incidents');
  const [now] = useState(() => Date.now());
  const openCount = s.incidents.filter(i => i.status === 'open').length;
  const frozenCount = s.artifacts.filter(a => isArtifactFrozen(s, a.id)).length;

  const nav: { id: View; label: string; icon: React.ReactNode; badge?: number; danger?: boolean }[] = [
    { id: 'incidents', label: '事故处置台', icon: <Siren size={16} />, badge: openCount, danger: openCount > 0 },
    { id: 'releases', label: '发行登记', icon: <Rocket size={16} />, badge: frozenCount, danger: frozenCount > 0 },
    { id: 'registry', label: '渠道与召回台账', icon: <BookMarked size={16} /> },
  ];

  return <div className="shell">
    <aside>
      <div className="brand">
        <div className="brand-icon"><ShieldCheck size={18} /></div>
        <div><b>License Lens</b><small>RECALL & ROLLBACK</small></div>
      </div>
      <div className="nav-title">RESPONSE</div>
      {nav.map(n => (
        <button key={n.id} className={view === n.id ? 'nav active' : 'nav'} onClick={() => setView(n.id)}>
          {n.icon}{n.label}
          {n.badge !== undefined && n.badge > 0 && <span className={n.danger ? 'red' : ''}>{n.badge}</span>}
        </button>
      ))}
      <div className="aside-bottom">
        <div className="mini-card">
          <Snowflake size={16} />
          <div><b>{frozenCount} 个产物冻结中</b><small>{openCount} 起事故待处置，发布通道锁定</small></div>
        </div>
        <div className="user"><div className="avatar">ZL</div><span>Zen Li</span><ChevronDown size={14} /></div>
      </div>
    </aside>
    <main>
      {view === 'incidents' && <IncidentsPage now={now} />}
      {view === 'releases' && <ReleasesPage now={now} />}
      {view === 'registry' && <RegistryPage />}
    </main>
  </div>;
}
