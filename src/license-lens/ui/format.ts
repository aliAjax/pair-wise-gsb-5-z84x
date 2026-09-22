export function fmtDate(ts?: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function relDate(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400000;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / 3600000)} 小时前`;
  const days = Math.floor(diff / day);
  return days <= 30 ? `${days} 天前` : fmtDate(ts).slice(0, 10);
}
