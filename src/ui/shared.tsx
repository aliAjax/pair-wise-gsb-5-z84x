// 页面层共享组件：徽标、弹窗、空态等；不含业务判定。

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

export function Badge({ tone, children }: { tone: 'teal' | 'red' | 'orange' | 'blue' | 'gray' | 'purple'; children: ReactNode }) {
  return <i className={`badge badge-${tone}`}>{children}</i>;
}

export function Modal({
  title, onClose, children, width,
}: { title: ReactNode; onClose: () => void; children: ReactNode; width?: number }) {
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal modal-lg" style={width ? { width: `min(${width}px, 100%)` } : undefined} onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="关闭"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ErrorLine({ text }: { text?: string }) {
  if (!text) return null;
  return <div className="error-line">{text}</div>;
}

export function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

const pad = (n: number) => String(n).padStart(2, '0');
export function fmtDate(ms?: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function relTime(from: number, now: number): string {
  const diff = now - from;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return '刚刚';
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}
