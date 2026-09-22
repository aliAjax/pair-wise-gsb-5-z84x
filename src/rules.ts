// 判定层：所有业务规则都是纯函数，不碰存储、不碰 React。
// 页面与存储只能通过这里的函数解释状态，保证口径一致。

import type {
  AppState, Artifact, Batch, DepRef, Incident, LicenseInfo, RuleResult, Snapshot,
} from './types';

const uidCounter = { n: 0 };
/** 新记录 id（存储层与动作层使用；种子数据自带稳定 id） */
export function uid(prefix: string, at: number): string {
  uidCounter.n += 1;
  return `${prefix}-${at.toString(36)}-${uidCounter.n.toString(36)}`;
}

/** 已撤销的许可证名集合——所有合规判定的唯一依据 */
export function revokedLicenseSet(licenses: LicenseInfo[]): Set<string> {
  return new Set(licenses.filter(l => l.status === 'revoked').map(l => l.name));
}

/** 一条依赖现在是否合规（许可证是否仍有效） */
export function depIsCompliant(dep: DepRef, revoked: Set<string>): boolean {
  return !revoked.has(dep.license);
}

/** 快照当前是否合规（按现行许可证重算，不盲信落库标记） */
export function snapshotIsLiveCompliant(s: Snapshot, revoked: Set<string>): boolean {
  return s.deps.every(d => depIsCompliant(d, revoked));
}

/** 同产物是否已有待处置事故——“同产物只留一条待处置事故” */
export function findOpenIncident(state: AppState, artifactId: string): Incident | undefined {
  return state.incidents.find(i => i.artifactId === artifactId && i.status === 'open');
}

export function artifactById(state: AppState, id: string): Artifact | undefined {
  return state.artifacts.find(a => a.id === id);
}

export function incidentArtifact(state: AppState, i: Incident): Artifact | undefined {
  return artifactById(state, i.artifactId);
}

/** 产物当前批次 */
export function currentBatchOf(state: AppState, artifactId: string): Batch | undefined {
  const a = artifactById(state, artifactId);
  if (!a?.currentBatchId) return undefined;
  return state.batches.find(b => b.id === a.currentBatchId);
}

export function batchOf(state: AppState, batchId: string): Batch | undefined {
  return state.batches.find(b => b.id === batchId);
}

export function snapshotById(batch: Batch, snapId: string): Snapshot | undefined {
  return batch.snapshots.find(s => s.id === snapId);
}

/**
 * 产物是否被冻结：存在待处置的“许可证撤销”事故即冻结。
 * 刷新后由存储层归一化保证与事故一致；此处为实时判定口径。
 */
export function isArtifactFrozen(state: AppState, artifactId: string): boolean {
  return state.incidents.some(
    i => i.artifactId === artifactId && i.status === 'open' && i.kind === 'revoked',
  );
}

/** 批次当前快照 */
export function currentSnapshot(batch: Batch): Snapshot | undefined {
  return batch.snapshots.find(s => s.id === batch.currentSnapshotId) ?? batch.snapshots[batch.snapshots.length - 1];
}

/**
 * 可回退目标：当前快照之前、按现行许可证判定合规、且不再包含事故问题依赖、
 * 时间最近的快照。“撤回只回退到最近合规快照”——不合规快照一律不可选。
 */
export function rollbackTarget(
  batch: Batch,
  revoked: Set<string>,
  offendingKeys: string[] = [],
): Snapshot | undefined {
  const keys = new Set(offendingKeys);
  const clean = (s: Snapshot) =>
    snapshotIsLiveCompliant(s, revoked) && !s.deps.some(d => keys.has(d.key));
  const cur = currentSnapshot(batch);
  const idx = cur ? batch.snapshots.findIndex(s => s.id === cur.id) : batch.snapshots.length;
  for (let i = idx - 1; i >= 0; i--) {
    if (clean(batch.snapshots[i])) return batch.snapshots[i];
  }
  return undefined;
}

/** 事故口径下，当前快照里的问题依赖 key（撤销：许可证已撤销；举报：事故登记时标注） */
export function offendingKeysInSnapshot(state: AppState, batch: Batch, incident: Incident): string[] {
  const cur = currentSnapshot(batch);
  if (!cur) return [];
  const revoked = revokedLicenseSet(state.licenses);
  const keys = new Set(incident.offendingDepKeys ?? []);
  if (incident.kind === 'revoked') {
    cur.deps.forEach(d => { if (revoked.has(d.license)) keys.add(d.key); });
  }
  return cur.deps.filter(d => keys.has(d.key)).map(d => d.key);
}

/** 事故口径下当前快照是否已干净（无问题依赖） */
export function currentSnapshotIsCleanFor(state: AppState, batch: Batch, incident: Incident): boolean {
  return offendingKeysInSnapshot(state, batch, incident).length === 0;
}

/** 引用覆盖：替代依赖覆盖的引用路径集合 */
export function coveredRefs(replacements: DepRef[]): Set<string> {
  return new Set(replacements.flatMap(r => r.refs));
}

/** 恢复判定：原引用路径中尚未被替代依赖覆盖的部分 */
export function uncoveredRefs(originalRefs: string[], replacements: DepRef[]): string[] {
  const covered = coveredRefs(replacements);
  return [...new Set(originalRefs)].filter(r => !covered.has(r));
}

/**
 * 恢复整批的判定：
 * - 必须存在替代依赖；
 * - 替代依赖的许可证当前必须有效；
 * - “替代依赖未覆盖原引用路径则整批不能恢复”——任一原路径缺失即拒绝。
 */
export function canRecoverBatch(
  originalRefs: string[],
  replacements: DepRef[],
  revoked: Set<string>,
): RuleResult {
  if (replacements.length === 0) return { ok: false, error: '尚未登记任何替代依赖' };
  const badLicense = replacements.find(r => revoked.has(r.license));
  if (badLicense) return { ok: false, error: `替代依赖 ${badLicense.name} 的许可证 ${badLicense.license} 已被撤销` };
  const missing = uncoveredRefs(originalRefs, replacements);
  if (missing.length > 0) {
    return { ok: false, error: `仍有 ${missing.length} 条原引用路径未被替代覆盖：${missing.join('、')}` };
  }
  return { ok: true };
}

/** 发布新批次的判定：事故未解除前不得发布新批次 */
export function canPublishBatch(state: AppState, artifactId: string): RuleResult {
  const open = findOpenIncident(state, artifactId);
  if (open) {
    return {
      ok: false,
      error: open.kind === 'revoked'
        ? `该产物已被冻结（事故 ${open.id} 未解除），不得发布新批次`
        : `该产物存在待处置事故 ${open.id}，解除前不得发布新批次`,
    };
  }
  return { ok: true };
}

/** 登记事故的判定：同产物只留一条待处置事故 */
export function canOpenIncident(state: AppState, artifactId: string): RuleResult {
  const open = findOpenIncident(state, artifactId);
  if (open) return { ok: false, error: `该产物已存在待处置事故 ${open.id}，须先解除` };
  return { ok: true };
}

/** 撤回 / 回滚判定（必须结合事故，举报类按事故标注的依赖认定问题项） */
export function canWithdraw(
  state: AppState,
  batch: Batch,
  incident: Incident,
  reason: string,
): RuleResult<Snapshot> {
  if (incident.status !== 'open') return { ok: false, error: '事故已解除，不能再撤回' };
  if (batch.state === 'withdrawn') return { ok: false, error: '该批次已撤回，不能重复撤回' };
  if (batch.state === 'recovered') return { ok: false, error: '该批次已完成替代恢复' };
  if (!reason.trim()) return { ok: false, error: '撤回必须填写原因并留档' };
  if (currentSnapshotIsCleanFor(state, batch, incident)) {
    return { ok: false, error: '当前快照已不含问题依赖，无需撤回' };
  }
  const target = rollbackTarget(batch, revokedLicenseSet(state.licenses), incident.offendingDepKeys);
  if (!target) return { ok: false, error: '不存在可回退的最近合规快照；请登记替代依赖后整批恢复' };
  return { ok: true, data: target };
}

/** 事故是否可直接解除：报告类可以；撤销类必须先完成恢复（批次进入 recovered） */
export function canResolveIncident(state: AppState, incident: Incident): RuleResult {
  if (incident.status === 'resolved') return { ok: false, error: '事故已解除' };
  if (incident.kind === 'revoked') {
    const batch = currentBatchOf(state, incident.artifactId);
    if (!batch || batch.state !== 'recovered') {
      return { ok: false, error: '许可证撤销事故必须在替代依赖覆盖全部引用路径、整批恢复后才能解除' };
    }
  }
  return { ok: true };
}

/** 一次撤销某许可证会命中哪些产物（当前批次当前快照里引用了该许可证依赖的产物） */
export function artifactsAffectedByLicense(state: AppState, licenseName: string): Artifact[] {
  const hit = new Set<string>();
  for (const b of state.batches) {
    const cur = currentSnapshot(b);
    if (cur && b.state !== 'withdrawn' && cur.deps.some(d => d.license === licenseName)) {
      hit.add(b.artifactId);
    }
  }
  return state.artifacts.filter(a => hit.has(a.id));
}

/** 恢复后生成的新快照：在基线快照上移除被撤销依赖、并入替代依赖 */
export function buildRecoveredSnapshot(base: Snapshot, offendingKeys: string[], replacements: DepRef[]): DepRef[] {
  const rest = base.deps.filter(d => !offendingKeys.includes(d.key));
  const byKey = new Map(rest.map(d => [d.key, d]));
  for (const r of replacements) byKey.set(r.key, r);
  return [...byKey.values()];
}
