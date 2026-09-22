// 状态 / 动作层：调用 rules.ts 判定、通过 storage.ts 持久化；页面只派发动作。
// 任何违反规则的动作都原样返回错误信息，状态不变。

import { useSyncExternalStore } from 'react';
import type {
  AppState, Artifact, Batch, DepRef, Incident, RecallContact, Channel,
} from './types';
import { loadState, resetState, saveState } from './storage';
import {
  artifactsAffectedByLicense, buildRecoveredSnapshot, canOpenIncident, canPublishBatch,
  canRecoverBatch, canResolveIncident, canWithdraw, currentBatchOf, currentSnapshot,
  findOpenIncident, revokedLicenseSet, uid,
} from './rules';

let state: AppState = loadState();
const listeners = new Set<() => void>();

function emit(next: AppState) {
  state = next;
  saveState(state);
  listeners.forEach(l => l());
}

function log(s: AppState, action: string, detail: string, at: number): AppState {
  return { ...s, logs: [{ id: uid('log', at), at, action, detail }, ...s.logs].slice(0, 200) };
}

export type ActionResult = { ok: boolean; error?: string; incidentId?: string };

/** 取该事故当前批次中实际命中的问题依赖（撤销类按现行许可证 + 事故现场取并集） */
function liveOffendingKeys(s: AppState, batch: Batch, incident: Incident): string[] {
  const cur = currentSnapshot(batch);
  if (!cur) return [];
  const revoked = revokedLicenseSet(s.licenses);
  const keys = new Set(incident.offendingDepKeys ?? []);
  cur.deps.forEach(d => {
    if (incident.kind === 'revoked' && revoked.has(d.license)) keys.add(d.key);
  });
  return cur.deps.filter(d => keys.has(d.key)).map(d => d.key);
}

/** 登记新产物 */
export function registerArtifact(input: { name: string; code: string; owner: string }): ActionResult {
  if (!input.name.trim() || !input.code.trim()) return { ok: false, error: '产物名称与编号必填' };
  const at = Date.now();
  if (state.artifacts.some(a => a.code === input.code.trim())) {
    return { ok: false, error: `产物编号 ${input.code} 已登记` };
  }
  const artifact: Artifact = {
    id: uid('art', at), name: input.name.trim(), code: input.code.trim().toUpperCase(),
    owner: input.owner.trim() || '未指定', createdAt: at,
  };
  emit(log({ ...state, artifacts: [...state.artifacts, artifact] }, '发行登记', `登记产物 ${artifact.code} · ${artifact.name}`, at));
  return { ok: true };
}

/** 发布新批次（事故未解除 / 冻结中一律拒绝） */
export function publishBatch(input: {
  artifactId: string; version: string; channelIds: string[]; deps: DepRef[];
}): ActionResult {
  const guard = canPublishBatch(state, input.artifactId);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!input.version.trim()) return { ok: false, error: '批次版本号必填' };
  if (input.channelIds.length === 0) return { ok: false, error: '至少选择一个分发渠道' };
  if (input.deps.length === 0) return { ok: false, error: '依赖清单为空，不能发布' };
  const revoked = revokedLicenseSet(state.licenses);
  const bad = input.deps.find(d => revoked.has(d.license));
  if (bad) return { ok: false, error: `依赖 ${bad.name} 的许可证 ${bad.license} 已撤销，不能进入新批次` };
  const at = Date.now();
  const batchId = uid('batch', at);
  const snapshotId = uid('snap', at + 1);
  const batch: Batch = {
    id: batchId, artifactId: input.artifactId, version: input.version.trim(),
    channelIds: input.channelIds, releasedAt: at, currentSnapshotId: snapshotId, state: 'released',
    snapshots: [{ id: snapshotId, label: `${input.version} 发布快照`, at, compliant: true, deps: input.deps }],
  };
  let next: AppState = {
    ...state,
    batches: [...state.batches, batch],
    artifacts: state.artifacts.map(a => a.id === input.artifactId ? { ...a, currentBatchId: batchId } : a),
  };
  const art = state.artifacts.find(a => a.id === input.artifactId)!;
  next = log(next, '发布批次', `${art.code} ${input.version} 经 ${input.channelIds.length} 个渠道分发，依赖 ${input.deps.length} 项`, at);
  emit(next);
  return { ok: true };
}

/** 登记合规举报事故（同产物只留一条待处置） */
export function openReportIncident(input: {
  artifactId: string; title: string; detail: string; depKeys: string[];
}): ActionResult {
  const guard = canOpenIncident(state, input.artifactId);
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!input.title.trim()) return { ok: false, error: '事故标题必填' };
  const at = Date.now();
  const batch = currentBatchOf(state, input.artifactId);
  const refs = new Set<string>();
  if (batch) {
    const cur = currentSnapshot(batch);
    cur?.deps.filter(d => input.depKeys.includes(d.key)).forEach(d => d.refs.forEach(r => refs.add(r)));
  }
  const incident: Incident = {
    id: uid('inc', at), artifactId: input.artifactId, kind: 'report', status: 'open',
    title: input.title.trim(), detail: input.detail.trim() || '（无补充说明）', createdAt: at,
    offendingDepKeys: input.depKeys, originalRefs: [...refs], withdrawals: [], rollbacks: [],
  };
  const art = state.artifacts.find(a => a.id === input.artifactId)!;
  emit(log({ ...state, incidents: [...state.incidents, incident] }, '事故登记', `inc ${incident.id}：${art.code} ${incident.title}`, at));
  return { ok: true, incidentId: incident.id };
}

/**
 * 撤销许可证：命中产物逐个冻结；同产物只留一条待处置事故，已在处置中的跳过。
 * 这是“许可证撤销时冻结产物”的唯一入口。
 */
export function revokeLicense(name: string, note: string): ActionResult & { frozen: number; skipped: number } {
  if (!name.trim()) return { ok: false, error: '请选择许可证', frozen: 0, skipped: 0 };
  const at = Date.now();
  const lic = state.licenses.find(l => l.name === name);
  if (!lic) return { ok: false, error: '许可证不存在', frozen: 0, skipped: 0 };
  if (lic.status === 'revoked') return { ok: false, error: `${name} 已经处于撤销状态`, frozen: 0, skipped: 0 };

  let next: AppState = {
    ...state,
    licenses: state.licenses.map(l => l.name === name ? { ...l, status: 'revoked', revokedAt: at, note: note.trim() || l.note } : l),
  };

  const affected = artifactsAffectedByLicense(next, name);
  let frozen = 0;
  let skipped = 0;
  const newIncidents: Incident[] = [];
  for (const art of affected) {
    if (findOpenIncident(next, art.id)) { skipped += 1; continue; }
    const batch = currentBatchOf(next, art.id);
    const cur = batch ? currentSnapshot(batch) : undefined;
    const hitDeps = cur?.deps.filter(d => d.license === name) ?? [];
    const refs = new Set<string>();
    hitDeps.forEach(d => d.refs.forEach(r => refs.add(r)));
    const incident: Incident = {
      id: uid('inc', at + frozen + 1), artifactId: art.id, kind: 'revoked', status: 'open',
      title: `${name} 许可证撤销`,
      detail: `${name} 被撤销，${art.code} 当前批次引用该许可证的依赖须立即停止再分发。${note.trim() ? '说明：' + note.trim() : ''}`,
      createdAt: at, offendingDepKeys: hitDeps.map(d => d.key), originalRefs: [...refs],
      withdrawals: [], rollbacks: [],
    };
    newIncidents.push(incident);
    frozen += 1;
  }
  next = { ...next, incidents: [...next.incidents, ...newIncidents] };
  next = log(next, '许可证撤销', `${name} 撤销：冻结产物 ${frozen} 个${skipped ? `，${skipped} 个产物已有待处置事故而跳过` : ''}`, at);
  emit(next);
  return { ok: true, frozen, skipped };
}

/** 撤回批次：只回退到最近合规快照，原因必填留痕；无可回退快照则拒绝 */
export function withdrawBatch(incidentId: string, reason: string): ActionResult {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!incident) return { ok: false, error: '事故不存在' };
  const batch = currentBatchOf(state, incident.artifactId);
  if (!batch) return { ok: false, error: '该产物当前没有在分发的批次' };
  const verdict = canWithdraw(state, batch, incident, reason);
  if (!verdict.ok) return { ok: false, error: verdict.error };
  const target = verdict.data!;
  const at = Date.now();
  const fromId = batch.currentSnapshotId;

  const updatedBatch: Batch = {
    ...batch,
    state: 'withdrawn',
    currentSnapshotId: target.id,
    snapshots: batch.snapshots.map(s => ({ ...s, deps: s.deps.map(d => ({ ...d, refs: [...d.refs] })) })),
  };
  const updatedIncident: Incident = {
    ...incident,
    withdrawals: [...incident.withdrawals, { batchId: batch.id, reason: reason.trim(), at }],
    rollbacks: [...incident.rollbacks, { batchId: batch.id, fromSnapshotId: fromId, toSnapshotId: target.id, reason: reason.trim(), at }],
  };
  let next: AppState = {
    ...state,
    batches: state.batches.map(b => b.id === batch.id ? updatedBatch : b),
    incidents: state.incidents.map(i => i.id === incident.id ? updatedIncident : i),
  };
  next = log(next, '撤回 / 回滚', `${incident.id} 撤回批次 ${batch.version}：${target.label}；原因：${reason.trim()}`, at);
  emit(next);
  return { ok: true };
}

/**
 * 整批恢复：登记替代依赖并覆盖全部原引用路径，缺一不可。
 * 生成新的合规快照，批次回到 recovered；这是解除撤销事故的前提。
 */
export function recoverBatch(incidentId: string, replacements: DepRef[]): ActionResult {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!incident) return { ok: false, error: '事故不存在' };
  if (incident.status !== 'open') return { ok: false, error: '事故已解除' };
  const batch = currentBatchOf(state, incident.artifactId);
  if (!batch) return { ok: false, error: '该产物当前没有批次可恢复' };
  if (batch.state === 'recovered') return { ok: false, error: '该批次已完成替代恢复' };

  const revoked = revokedLicenseSet(state.licenses);
  const originalRefs = incident.originalRefs ?? [];
  const verdict = canRecoverBatch(originalRefs, replacements, revoked);
  if (!verdict.ok) return { ok: false, error: verdict.error };

  // 基线：当前快照（已撤回则为回退后的合规快照；未撤回则为原快照）
  const cur = currentSnapshot(batch);
  if (!cur) return { ok: false, error: '批次没有基线快照' };
  const offendingKeys = incident.kind === 'revoked'
    ? cur.deps.filter(d => revoked.has(d.license) || (incident.offendingDepKeys ?? []).includes(d.key)).map(d => d.key)
    : liveOffendingKeys(state, batch, incident);

  const at = Date.now();
  const newSnapId = uid('snap', at);
  const newDeps = buildRecoveredSnapshot(cur, offendingKeys, replacements);
  const newSnapshot = {
    id: newSnapId, label: `${batch.version} 替代恢复快照`, at, compliant: true, deps: newDeps,
  };
  const updatedBatch: Batch = {
    ...batch, state: 'recovered', currentSnapshotId: newSnapId, snapshots: [...batch.snapshots, newSnapshot],
  };
  let next: AppState = { ...state, batches: state.batches.map(b => b.id === batch.id ? updatedBatch : b) };
  next = log(next, '整批恢复', `${incident.id}：替代依赖 ${replacements.map(r => r.name).join('、')} 覆盖 ${originalRefs.length} 条引用路径，生成 ${newSnapshot.label}`, at);
  emit(next);
  return { ok: true };
}

/** 解除事故（撤销类必须已整批恢复） */
export function resolveIncident(incidentId: string): ActionResult {
  const incident = state.incidents.find(i => i.id === incidentId);
  if (!incident) return { ok: false, error: '事故不存在' };
  const verdict = canResolveIncident(state, incident);
  if (!verdict.ok) return { ok: false, error: verdict.error };
  const at = Date.now();
  const updated: Incident = {
    ...incident, status: 'resolved', resolvedAt: at,
    resolution: incident.kind === 'revoked'
      ? '替代依赖覆盖全部引用路径，整批恢复后解除，产物解冻。'
      : '处置完成，撤回 / 回滚已留痕，解除事故。',
  };
  const batch = currentBatchOf(state, incident.artifactId);
  let next: AppState = { ...state, incidents: state.incidents.map(i => i.id === incident.id ? updated : i) };
  next = log(next, '事故解除', `${incident.id} 解除${incident.kind === 'revoked' ? '，产物恢复可发布' : ''}${batch ? `（批次 ${batch.version}）` : ''}`, at);
  emit(next);
  return { ok: true };
}

/** 渠道 / 联系人登记 */
export function addChannel(input: Omit<Channel, 'id'>): ActionResult {
  if (!input.name.trim()) return { ok: false, error: '渠道名称必填' };
  const at = Date.now();
  const channel: Channel = { ...input, name: input.name.trim(), id: uid('ch', at) };
  emit(log({ ...state, channels: [...state.channels, channel] }, '渠道登记', `${channel.name}（${channel.kind}/${channel.region}）`, at));
  return { ok: true };
}

export function addContact(input: Omit<RecallContact, 'id'>): ActionResult {
  if (!input.name.trim() || !input.email.trim()) return { ok: false, error: '联系人姓名与邮箱必填' };
  const at = Date.now();
  const contact: RecallContact = { ...input, name: input.name.trim(), email: input.email.trim(), id: uid('ct', at) };
  emit(log({ ...state, contacts: [...state.contacts, contact] }, '召回联系人登记', `${contact.name} · ${contact.role}（SLA ${contact.slaHours}h）`, at));
  return { ok: true };
}

export function reseed(): void {
  emit(resetState());
}

export function getState(): AppState { return state; }

/** 订阅整个状态引用（每次 emit 才生成新引用）；派生数据在组件内 useMemo */
export function useStore(): AppState {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getState,
    getState,
  );
}

export type { Batch, DepRef };
