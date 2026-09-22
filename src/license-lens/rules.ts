// 判定层：纯函数。所有业务规则集中于此，不读写存储、不触碰 React。
//
// 规则要点：
// 1. 同一产物同时只允许存在一条待处置事故；
// 2. 事故未解除前不得发布新批次（许可证撤销时产物同时冻结）；
// 3. 撤回只回退到最近合规快照，且必须留原因；
// 4. 替代依赖未覆盖全部原引用路径时，整批不能恢复；
// 5. 合规判定以当前依赖目录为准（许可证被撤销即不再合规）。

import type {
  AffectedDep, Artifact, Batch, Dep, Incident, ManifestEntry, ReplacementDraft, Snapshot, State,
} from './types';

const COPYLEFT = /AGPL|GPL/i;

/** 单个依赖当前是否合规：许可证未撤销且非强 copyleft */
export function depCompliant(dep: Dep | undefined): dep is Dep {
  return !!dep && dep.licenseStatus === 'active' && !COPYLEFT.test(dep.license);
}

/** 许可证是否处于撤销状态（撤销许可证即触发冻结） */
export const isRevoked = (dep: Dep): boolean => dep.licenseStatus === 'revoked';

export function findDep(state: State, depId: string): Dep | undefined {
  return state.deps.find((d) => d.id === depId);
}

export function findArtifact(state: State, id: string): Artifact | undefined {
  return state.artifacts.find((a) => a.id === id);
}

export function findBatch(state: State, id: string): Batch | undefined {
  return state.batches.find((b) => b.id === id);
}

export function findSnapshot(state: State, id: string): Snapshot | undefined {
  return state.snapshots.find((s) => s.id === id);
}

export function findIncident(state: State, id: string): Incident | undefined {
  return state.incidents.find((i) => i.id === id);
}

/** 清单整体是否合规：每条引用的依赖在当前目录下都合规 */
export function manifestCompliant(state: State, manifest: ManifestEntry[]): boolean {
  return manifest.every((m) => depCompliant(findDep(state, m.depId)));
}

export function openIncidents(state: State): Incident[] {
  return state.incidents.filter((i) => i.status === 'open');
}

export function openIncidentFor(state: State, artifactId: string): Incident | undefined {
  return state.incidents.find((i) => i.artifactId === artifactId && i.status === 'open');
}

/** 产物冻结：存在由许可证撤销引发的待处置事故 */
export function artifactFrozen(state: State, artifactId: string): boolean {
  return state.incidents.some(
    (i) => i.artifactId === artifactId && i.status === 'open' && i.type === 'revocation',
  );
}

/** 发布闸门：事故未解除（无论类型）前不得发布新批次 */
export function canPublish(state: State, artifactId: string): {ok: boolean; reason?: string} {
  const inc = openIncidentFor(state, artifactId);
  if (inc) return {ok: false, reason: `存在待处置事故：${inc.title}`};
  return {ok: true};
}

/** 批次是否已撤回回退到合规快照 */
export function isBatchRolledBack(incident: Incident, batchId: string): boolean {
  return !!incident.rollbacks[batchId];
}

/** 事故涉及的批次（按时间倒序） */
export function incidentBatches(state: State, incident: Incident): Batch[] {
  return incident.batchIds
    .map((id) => findBatch(state, id))
    .filter((b): b is Batch => !!b)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}

/**
 * 最近合规快照：撤回只允许回退到这里。
 * 取该产物、时间不晚于事故批次、发布来源且合规的最新快照。
 */
export function latestCompliantSnapshot(
  state: State, artifactId: string, batchId: string,
): Snapshot | undefined {
  const batch = findBatch(state, batchId);
  if (!batch) return undefined;
  return state.snapshots
    .filter((s) =>
      s.artifactId === artifactId
      && s.source === 'publish'
      && s.compliant
      && s.at <= batch.publishedAt)
    .sort((a, b) => b.at - a.at)[0];
}

/** 撤回前置条件：有最近合规快照，且该批次尚未撤回 */
export function rollbackTarget(
  state: State, incident: Incident, batchId: string,
): {ok: boolean; snapshot?: Snapshot; reason?: string} {
  if (isBatchRolledBack(incident, batchId)) return {ok: false, reason: '该批次已撤回'};
  const snap = latestCompliantSnapshot(state, incident.artifactId, batchId);
  if (!snap) return {ok: false, reason: '没有可回退的最近合规快照'};
  return {ok: true, snapshot: snap};
}

/** 可作为替代的依赖：目录中处于有效状态且合规（不能用已撤销/强 copyleft 依赖替代） */
export function replacementCandidates(state: State, depId: string): Dep[] {
  return state.deps.filter((d) => d.id !== depId && depCompliant(d));
}

/** 事故下某受波及依赖尚未覆盖的引用路径 */
export function uncoveredPaths(incident: Incident, depId: string): string[] {
  const affected = incident.affected.find((a) => a.depId === depId);
  if (!affected) return [];
  const covered = new Set(
    incident.replacements.filter((r) => r.depId === depId).map((r) => r.path),
  );
  return affected.paths.filter((p) => !covered.has(p));
}

/** 整起事故尚未覆盖的（依赖 → 路径）集合 */
export function allUncovered(incident: Incident): {depId: string; path: string}[] {
  return incident.affected.flatMap((a) =>
    uncoveredPaths(incident, a.depId).map((path) => ({depId: a.depId, path})));
}

/** 撤回是否全部完成（每个涉及批次都已回退到合规快照） */
export function allRolledBack(incident: Incident): boolean {
  return incident.batchIds.length > 0 &&
    incident.batchIds.every((id) => isBatchRolledBack(incident, id));
}

/**
 * 整批恢复闸门：
 *  - 全部批次已撤回回退到合规快照；
 *  - 替代依赖覆盖全部原引用路径；
 *  - 恢复后清单（回退快照 + 覆盖替代）在当前目录下合规。
 */
export function restoreCheck(
  state: State, incident: Incident,
): {ok: boolean; reasons: string[]; restored: Record<string, ManifestEntry[]>} {
  const reasons: string[] = [];
  const restored: Record<string, ManifestEntry[]> = {};

  if (!allRolledBack(incident)) {
    reasons.push('仍有批次未撤回回退到合规快照');
  }
  const missing = allUncovered(incident);
  if (missing.length > 0) {
    reasons.push(`替代依赖未覆盖 ${missing.length} 条原引用路径`);
  }

  for (const batchId of incident.batchIds) {
    const snapId = incident.rollbacks[batchId];
    const snap = snapId ? findSnapshot(state, snapId) : undefined;
    if (!snap) continue;
    restored[batchId] = composeRestoredManifest(state, snap.manifest, incident.replacements);
  }

  const manifestsCompliant = Object.values(restored).every((m) => manifestCompliant(state, m));
  if (!manifestsCompliant) reasons.push('恢复后清单仍包含不合规依赖');

  return {ok: reasons.length === 0, reasons, restored};
}

/** 恢复后清单 = 回退到的合规快照清单 + 按原引用路径落入的替代依赖 */
export function composeRestoredManifest(
  state: State, base: ManifestEntry[], replacements: ReplacementDraft[],
): ManifestEntry[] {
  const manifest = base.map((m) => ({...m, paths: [...m.paths]}));
  for (const r of replacements) {
    const dep = findDep(state, r.targetDepId);
    if (!dep) continue;
    let entry = manifest.find((m) => m.depId === dep.id);
    if (!entry) {
      entry = {depId: dep.id, name: dep.name, version: dep.version, license: dep.license, paths: []};
      manifest.push(entry);
    }
    if (!entry.paths.includes(r.path)) entry.paths.push(r.path);
  }
  return manifest.sort((a, b) => a.name.localeCompare(b.name));
}

/** 通用违规事故可否直接解除（许可证撤销事故必须走整批恢复） */
export function canResolve(incident: Incident): boolean {
  return incident.type === 'violation' && incident.status === 'open';
}

/** 汇总一个受波及依赖（供撤销时合并同一事故使用） */
export function collectAffected(
  state: State, depId: string, batchIds: string[],
): AffectedDep | undefined {
  const dep = findDep(state, depId);
  if (!dep) return undefined;
  const paths = Array.from(new Set(
    state.batches
      .filter((b) => batchIds.includes(b.id))
      .flatMap((b) => b.manifest.filter((m) => m.depId === depId).flatMap((m) => m.paths)),
  ));
  return {depId, name: dep.name, version: dep.version, license: dep.license, batchIds, paths};
}

/** 该批次撤回时生成的 rollback 快照（撤回原因记录在快照上，按批次留存） */
export function rollbackSnapshot(state: State, incident: Incident, batchId: string): Snapshot | undefined {
  const snapId = incident.rollbacks[batchId];
  if (!snapId) return undefined;
  return state.snapshots
    .filter((s) => s.source === 'rollback' && s.batchId === batchId)
    .sort((a, b) => b.at - a.at)[0] ?? findSnapshot(state, snapId);
}

export type BatchPhase = 'frozen' | 'rolledback' | 'restored' | 'normal';

/** 批次展示态（派生）：冻结中 / 已撤回待替代 / 已恢复 / 正常。
 *  注意：只有许可证撤销事故冻结批次；通用违规事故只拦截新批次发布，在役批次不冻结。 */
export function batchPhase(state: State, batch: Batch): BatchPhase {
  const incident = state.incidents.find(
    (i) => i.status === 'open' && i.batchIds.includes(batch.id) && i.type === 'revocation',
  );
  if (!incident) return 'normal';
  if (isBatchRolledBack(incident, batch.id)) {
    return restoreCheck(state, incident).ok ? 'restored' : 'rolledback';
  }
  return 'frozen';
}
