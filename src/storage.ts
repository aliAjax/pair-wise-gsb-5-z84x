// 存储层：只负责持久化与读取后的归一化，不含任何业务决策。
// 判定一律在 rules.ts；刷新页面后，冻结状态等派生结果由这里重新对齐。

import type { AppState } from './types';
import { seedState } from './data';
import { revokedLicenseSet } from './rules';

const KEY = 'license-lens-rollback-v1';

/**
 * 归一化：落库的状态只信“事故”这一事实源，刷新后重新对齐：
 * 1. 快照合规标记按现行撤销许可证重算（许可证撤销后旧快照即变不合规）；
 * 2. 批次/快照引用完整性修复（currentSnapshotId 必须存在）；
 * 3. 事故的问题依赖与原引用路径与现存快照对齐，保证引用覆盖判定始终一致。
 */
export function normalize(state: AppState): AppState {
  const revoked = revokedLicenseSet(state.licenses);

  for (const batch of state.batches) {
    for (const s of batch.snapshots) {
      s.compliant = s.deps.every(d => !revoked.has(d.license));
    }
    if (batch.snapshots.length > 0 && !batch.snapshots.some(s => s.id === batch.currentSnapshotId)) {
      batch.currentSnapshotId = batch.snapshots[batch.snapshots.length - 1].id;
    }
  }

  // 事故 originalRefs：以当前/历史快照中问题依赖实际覆盖的路径为准补齐，
  // 避免“替代覆盖判定”与真实引用清单脱节。
  for (const inc of state.incidents) {
    if (inc.status !== 'open' || inc.kind !== 'revoked') continue;
    const refSet = new Set<string>(inc.originalRefs ?? []);
    const keySet = new Set<string>(inc.offendingDepKeys ?? []);
    for (const b of state.batches) {
      if (b.artifactId !== inc.artifactId) continue;
      for (const s of b.snapshots) {
        for (const d of s.deps) {
          if (keySet.has(d.key) || revoked.has(d.license)) {
            keySet.add(d.key);
            d.refs.forEach(r => refSet.add(r));
          }
        }
      }
    }
    inc.offendingDepKeys = [...keySet];
    inc.originalRefs = [...refSet].sort();
  }

  return state;
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return normalize(seedState());
    const parsed = JSON.parse(raw) as AppState;
    if (!parsed || !Array.isArray(parsed.artifacts) || !Array.isArray(parsed.incidents)) {
      return normalize(seedState());
    }
    return normalize(parsed);
  } catch {
    return normalize(seedState());
  }
}

export function saveState(state: AppState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalize(state)));
  } catch {
    // 存储不可用时仅影响持久化，当前会话仍可操作
  }
}

export function resetState(): AppState {
  const fresh = normalize(seedState());
  saveState(fresh);
  return fresh;
}
