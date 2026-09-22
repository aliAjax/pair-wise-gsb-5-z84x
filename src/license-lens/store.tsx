// 存储层：reducer + localStorage 持久化。
// 不内置判定：所有闸门校验调用 rules 纯函数；reducer 只落实已经过校验的事件。
// 派生数据（冻结、撤回态、路径覆盖）一律在渲染时由 rules 重算，刷新后天然一致。

import {createContext, useContext, useEffect, useMemo, useReducer, type ReactNode} from 'react';
import {initialState, uid} from './model';
import {
  allUncovered, canPublish, canResolve, collectAffected, findArtifact, findDep, isBatchRolledBack,
  manifestCompliant, openIncidentFor, restoreCheck, rollbackTarget,
} from './rules';
import type {
  Artifact, Batch, Contact, Dep, Incident, ManifestEntry, ReleaseChannel, Snapshot, State,
} from './types';

const KEY = 'license-lens-rollback-v1';

export interface Result {ok: boolean; error?: string; id?: string; warning?: string}

type Event =
  | {t: 'dep/add'; dep: Dep}
  | {t: 'dep/revoke'; id: string; reason: string; at: number}
  | {t: 'artifact/register'; artifact: Artifact}
  | {t: 'batch/publish'; batch: Batch; snapshot: Snapshot}
  | {t: 'incident/open'; incident: Incident}
  | {t: 'incident/merge-affected'; id: string; affected: Incident['affected']}
  | {t: 'incident/rollback'; id: string; batchId: string; targetSnapshotId: string; snapshot: Snapshot}
  | {t: 'incident/replacement'; id: string; depId: string; path: string; targetDepId: string | null}
  | {t: 'incident/resolve'; id: string; resolution: string; at: number;
     restores: {batchId: string; manifest: ManifestEntry[]; snapshot: Snapshot}[]}
  | {t: 'state/reset'};

function mergeAffected(list: Incident['affected'], add: Incident['affected']): Incident['affected'] {
  const next = list.map((a) => ({...a, batchIds: [...a.batchIds], paths: [...a.paths]}));
  for (const item of add) {
    const existing = next.find((a) => a.depId === item.depId);
    if (existing) {
      existing.batchIds = Array.from(new Set([...existing.batchIds, ...item.batchIds]));
      existing.paths = Array.from(new Set([...existing.paths, ...item.paths]));
    } else {
      next.push({...item});
    }
  }
  return next;
}

function reducer(state: State, e: Event): State {
  switch (e.t) {
    case 'dep/add':
      return {...state, deps: [...state.deps, e.dep]};

    case 'dep/revoke':
      return {
        ...state,
        deps: state.deps.map((d) => d.id === e.id
          ? {...d, licenseStatus: 'revoked', revokedAt: e.at, revokedReason: e.reason} : d),
      };

    case 'artifact/register':
      return {...state, artifacts: [...state.artifacts, e.artifact]};

    case 'batch/publish':
      return {
        ...state,
        batches: [...state.batches, e.batch],
        snapshots: [...state.snapshots, e.snapshot],
      };

    case 'incident/open':
      return {...state, incidents: [...state.incidents, e.incident]};

    case 'incident/merge-affected':
      return {
        ...state,
        incidents: state.incidents.map((i) => i.id === e.id
          ? {...i, affected: mergeAffected(i.affected, e.affected),
               batchIds: Array.from(new Set([...i.batchIds, ...e.affected.flatMap((a) => a.batchIds)]))}
          : i),
      };

    case 'incident/rollback':
      return {
        ...state,
        snapshots: [...state.snapshots, e.snapshot],
        batches: state.batches.map((b) => b.id === e.batchId
          ? {...b, manifest: e.snapshot.manifest.map((m) => ({...m, paths: [...m.paths]}))} : b),
        incidents: state.incidents.map((i) => i.id === e.id
          ? {...i, rollbacks: {...i.rollbacks, [e.batchId]: e.targetSnapshotId}}
          : i),
      };

    case 'incident/replacement':
      return {
        ...state,
        incidents: state.incidents.map((i) => {
          if (i.id !== e.id) return i;
          const others = i.replacements.filter(
            (r) => !(r.depId === e.depId && r.path === e.path));
          if (!e.targetDepId) return {...i, replacements: others};
          return {...i, replacements: [...others, {depId: e.depId, path: e.path, targetDepId: e.targetDepId}]};
        }),
      };

    case 'incident/resolve': {
      const batches = state.batches.map((b) => {
        const r = e.restores.find((x) => x.batchId === b.id);
        return r ? {...b, manifest: r.manifest} : b;
      });
      const snapshots = [...state.snapshots, ...e.restores.map((r) => r.snapshot)];
      return {
        ...state,
        batches,
        snapshots,
        incidents: state.incidents.map((i) => i.id === e.id
          ? {...i, status: 'resolved', resolvedAt: e.at, resolution: e.resolution} : i),
      };
    }

    case 'state/reset':
      return structuredClone(initialState);

    default:
      return state;
  }
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as State;
    if (parsed.version !== 1 || !Array.isArray(parsed.deps) || !Array.isArray(parsed.incidents)) {
      return initialState;
    }
    return parsed;
  } catch {
    return initialState;
  }
}

export interface PublishInput {
  artifactId: string;
  version: string;
  channels: Omit<ReleaseChannel, 'id'>[];
  manifest: {depId: string; paths: string[]}[];
}

interface Store {
  state: State;
  addDep(input: Omit<Dep, 'id' | 'licenseStatus'>): Result;
  revokeDep(depId: string, reason: string): Result;
  registerArtifact(input: {name: string; code: string; owner: string; contacts: Omit<Contact, 'id'>[]}): Result;
  publishBatch(input: PublishInput): Result;
  reportViolation(input: {artifactId: string; batchIds: string[]; title: string; detail: string}): Result;
  rollback(incidentId: string, batchId: string, reason: string): Result;
  setReplacement(incidentId: string, depId: string, path: string, targetDepId: string | null): void;
  restore(incidentId: string, resolution: string): Result;
  resolveViolation(incidentId: string, resolution: string): Result;
  reset(): void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({children}: {children: ReactNode}) {
  const [state, dispatch] = useReducer(reducer, undefined, load);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 存储不可用时静默降级 */ }
  }, [state]);

  const store = useMemo<Store>(() => ({
    state,

    addDep(input) {
      if (!input.name.trim()) return {ok: false, error: '请填写依赖名称'};
      const dep: Dep = {...input, id: uid('d'), licenseStatus: 'active'};
      dispatch({t: 'dep/add', dep});
      return {ok: true, id: dep.id};
    },

    /**
     * 撤销许可证：标记目录项 → 找出版本清单仍在引用它的已发行批次：
     *  - 同产物已有待处置事故（任何类型）→ 拒绝，先处置既有事故（同产物只留一条）；
     *  - 同产物已有待处置撤销事故 → 把新受波及范围并入；
     *  - 否则新开撤销事故（产物随之冻结，由 rules 派生）。
     */
    revokeDep(depId, reason) {
      const dep = findDep(state, depId);
      if (!dep) return {ok: false, error: '依赖不存在'};
      if (dep.licenseStatus === 'revoked') return {ok: false, error: '该许可证已处于撤销状态'};
      if (!reason.trim()) return {ok: false, error: '请填写撤销原因'};

      const at = Date.now();
      const batches = state.batches.filter((b) => b.manifest.some((m) => m.depId === depId));
      dispatch({t: 'dep/revoke', id: depId, reason: reason.trim(), at});
      if (batches.length === 0) return {ok: true};

      const byArtifact = new Map<string, string[]>();
      for (const b of batches) {
        byArtifact.set(b.artifactId, [...(byArtifact.get(b.artifactId) ?? []), b.id]);
      }
      const blocked: string[] = [];
      for (const [artifactId, ids] of byArtifact) {
        const existing = openIncidentFor(state, artifactId);
        if (existing) {
          if (existing.type === 'revocation') {
            const affected = collectAffected(state, depId, ids);
            if (affected) dispatch({t: 'incident/merge-affected', id: existing.id, affected: [affected]});
          } else {
            blocked.push(findArtifact(state, artifactId)?.name ?? artifactId);
          }
          // 同产物只允许一条待处置事故：违规事故未解除前不新开第二条。
          continue;
        }
        const affected = collectAffected(state, depId, ids);
        if (!affected) continue;
        const incident: Incident = {
          id: uid('i'),
          type: 'revocation',
          title: `${dep.name} 许可证撤销`,
          detail: `${dep.license} 许可证被撤销：${reason.trim()}。${ids.length} 个已发行批次、${affected.paths.length} 条引用路径受波及，产物已冻结。`,
          artifactId,
          batchIds: ids,
          status: 'open',
          createdAt: at,
          affected: [affected],
          replacements: [],
          rollbacks: {},
        };
        dispatch({t: 'incident/open', incident});
      }
      return blocked.length > 0
        ? {ok: true, warning: `以下产物已有待处置违规事故，未重复立案：${blocked.join('、')}；请先在事故台解除既有事故`}
        : {ok: true};
    },

    registerArtifact(input) {
      if (!input.name.trim() || !input.code.trim()) return {ok: false, error: '请填写产物名称与编号'};
      if (state.artifacts.some((a) => a.code === input.code.trim())) {
        return {ok: false, error: '该产物编号已登记'};
      }
      const artifact: Artifact = {
        id: uid('a'),
        name: input.name.trim(),
        code: input.code.trim(),
        owner: input.owner.trim() || '未指定',
        contacts: input.contacts
          .filter((c) => c.name.trim() || c.channel.trim())
          .map((c) => ({...c, id: uid('c')})),
      };
      dispatch({t: 'artifact/register', artifact});
      return {ok: true, id: artifact.id};
    },

    publishBatch(input) {
      const gate = canPublish(state, input.artifactId);
      if (!gate.ok) return {ok: false, error: gate.reason ?? '当前不允许发布'};
      const artifact = state.artifacts.find((a) => a.id === input.artifactId);
      if (!artifact) return {ok: false, error: '产物不存在'};
      if (!input.version.trim()) return {ok: false, error: '请填写批次版本号'};
      if (state.batches.some((b) => b.artifactId === input.artifactId && b.version === input.version.trim())) {
        return {ok: false, error: '该版本批次已登记'};
      }
      const manifest: ManifestEntry[] = [];
      for (const item of input.manifest) {
        const dep = findDep(state, item.depId);
        const paths = item.paths.map((p) => p.trim()).filter(Boolean);
        if (!dep || paths.length === 0) continue;
        manifest.push({depId: dep.id, name: dep.name, version: dep.version, license: dep.license, paths});
      }
      if (manifest.length === 0) return {ok: false, error: '请至少登记一条带引用路径的依赖'};

      const at = Date.now();
      const batchId = uid('b');
      const snapshotId = uid('s');
      const batch: Batch = {
        id: batchId,
        artifactId: input.artifactId,
        version: input.version.trim(),
        publishedAt: at,
        channels: input.channels
          .filter((c) => c.name.trim() || c.location.trim())
          .map((c) => ({...c, id: uid('ch'), name: c.name.trim(), location: c.location.trim()})),
        manifest,
        publishSnapshotId: snapshotId,
      };
      const snapshot: Snapshot = {
        id: snapshotId,
        artifactId: input.artifactId,
        batchId,
        at,
        source: 'publish',
        compliant: manifestCompliant(state, manifest),
        label: `${input.version.trim()} 发布快照`,
        manifest: manifest.map((m) => ({...m, paths: [...m.paths]})),
      };
      dispatch({t: 'batch/publish', batch, snapshot});
      return {ok: true, id: batchId};
    },

    reportViolation(input) {
      if (!input.title.trim()) return {ok: false, error: '请填写事故标题'};
      const existing = openIncidentFor(state, input.artifactId);
      if (existing) return {ok: false, error: `同产物已有待处置事故：${existing.title}`};
      if (input.batchIds.length === 0) return {ok: false, error: '请至少选择一个涉事批次'};
      const incident: Incident = {
        id: uid('i'),
        type: 'violation',
        title: input.title.trim(),
        detail: input.detail.trim() || '分发过程中发现许可证义务违规，待整改。',
        artifactId: input.artifactId,
        batchIds: input.batchIds,
        status: 'open',
        createdAt: Date.now(),
        affected: [],
        replacements: [],
        rollbacks: {},
      };
      dispatch({t: 'incident/open', incident});
      return {ok: true, id: incident.id};
    },

    /** 撤回：只回退到最近合规快照，并留原因；复制一份 rollback 快照备查。 */
    rollback(incidentId, batchId, reason) {
      const incident = state.incidents.find((i) => i.id === incidentId);
      if (!incident || incident.status !== 'open' || incident.type !== 'revocation') {
        return {ok: false, error: '事故不存在或不可撤回'};
      }
      if (isBatchRolledBack(incident, batchId)) return {ok: false, error: '该批次已撤回'};
      if (!reason.trim()) return {ok: false, error: '撤回必须留原因'};
      const target = rollbackTarget(state, incident, batchId);
      if (!target.ok || !target.snapshot) return {ok: false, error: target.reason};

      const batch = state.batches.find((b) => b.id === batchId);
      const snapshot: Snapshot = {
        ...target.snapshot,
        id: uid('s'),
        at: Date.now(),
        source: 'rollback',
        label: `${batch?.version ?? ''} 撤回快照（回退自 ${target.snapshot.label}）`,
        reason: reason.trim(),
        manifest: target.snapshot.manifest.map((m) => ({...m, paths: [...m.paths]})),
      };
      dispatch({t: 'incident/rollback', id: incidentId, batchId,
        targetSnapshotId: target.snapshot.id, snapshot});
      return {ok: true};
    },

    setReplacement(incidentId, depId, path, targetDepId) {
      dispatch({t: 'incident/replacement', id: incidentId, depId, path, targetDepId});
    },

    /** 整批恢复：全部批次已撤回 + 替代依赖覆盖全部原引用路径，缺一不可。 */
    restore(incidentId, resolution) {
      const incident = state.incidents.find((i) => i.id === incidentId);
      if (!incident || incident.status !== 'open' || incident.type !== 'revocation') {
        return {ok: false, error: '事故不存在或不可恢复'};
      }
      if (!resolution.trim()) return {ok: false, error: '请填写恢复说明'};
      const check = restoreCheck(state, incident);
      if (!check.ok) return {ok: false, error: check.reasons[0]};

      const at = Date.now();
      const restores = incident.batchIds.map((batchId) => {
        const batch = state.batches.find((b) => b.id === batchId)!;
        const manifest = check.restored[batchId];
        const snapshot: Snapshot = {
          id: uid('s'),
          artifactId: incident.artifactId,
          batchId,
          at,
          source: 'restore',
          compliant: true,
          label: `${batch.version} 恢复快照`,
          reason: resolution.trim(),
          manifest: manifest.map((m) => ({...m, paths: [...m.paths]})),
        };
        return {batchId, manifest, snapshot};
      });
      dispatch({t: 'incident/resolve', id: incidentId, resolution: resolution.trim(), at, restores});
      return {ok: true};
    },

    resolveViolation(incidentId, resolution) {
      const incident = state.incidents.find((i) => i.id === incidentId);
      if (!incident || !canResolve(incident)) return {ok: false, error: '该事故不能直接解除'};
      if (!resolution.trim()) return {ok: false, error: '请填写整改说明'};
      dispatch({t: 'incident/resolve', id: incidentId, resolution: resolution.trim(),
        at: Date.now(), restores: []});
      return {ok: true};
    },

    reset() { dispatch({t: 'state/reset'}); },
  }), [state]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const store = useContext(Ctx);
  if (!store) throw new Error('useStore must be used within StoreProvider');
  return store;
}

/** 便捷：事故未覆盖路径条数（页面一致性徽标用） */
export function uncoveredCount(incident: Incident): number {
  return allUncovered(incident).length;
}
