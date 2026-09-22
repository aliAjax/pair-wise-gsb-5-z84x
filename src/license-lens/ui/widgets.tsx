import type {ButtonHTMLAttributes, ReactNode} from 'react';
import {X} from 'lucide-react';

type Tone = 'teal' | 'red' | 'orange' | 'blue' | 'gray' | 'purple';

const toneCls: Record<Tone, string> = {
  teal: 'badge-teal', red: 'badge-red', orange: 'badge-orange',
  blue: 'badge-blue', gray: 'badge-gray', purple: 'badge-purple',
};

export function Badge({tone = 'gray', children}: {tone?: Tone; children: ReactNode}) {
  return <i className={`badge ${toneCls[tone]}`}>{children}</i>;
}

export function Btn({
  variant = 'outline', size, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?: 'primary' | 'outline' | 'danger' | 'ghost'; size?: 'sm'}) {
  return (
    <button
      className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${rest.disabled ? ' is-disabled' : ''}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Banner({tone = 'gray', title, children}: {tone?: Tone; title?: ReactNode; children?: ReactNode}) {
  return (
    <div className={`banner ${toneCls[tone]}`}>
      {title && <b>{title}</b>}
      {children}
    </div>
  );
}

export function Modal({
  title, onClose, children, footer, wide,
}: {title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean}) {
  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div className={`modal-ll${wide ? ' wide' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="关闭"><X size={17}/></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({label, children, hint}: {label: string; children: ReactNode; hint?: string}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export const inputCls = 'inp';

export function Empty({children}: {children: ReactNode}) {
  return <div className="empty">{children}</div>;
}
