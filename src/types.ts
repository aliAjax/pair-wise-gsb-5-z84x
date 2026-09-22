// License Lens · 分发后许可证事故回滚台 —— 类型层
// 纯类型定义，不含任何判定与存储逻辑。

export type LicenseStatus = 'active' | 'revoked';

/** 许可证台账条目 */
export interface LicenseInfo {
  name: string;
  status: LicenseStatus;
  revokedAt?: number;
  note?: string;
}

/** 批次快照中的一条依赖（含在产物中被引用的路径） */
export interface DepRef {
  key: string;
  name: string;
  version: string;
  license: string;
  source: string;
  refs: string[];
}

/** 批次历史快照：某一批在某个时点的完整依赖清单 */
export interface Snapshot {
  id: string;
  label: string;
  at: number;
  /** 记录当时是否合规；当前是否合规由判定层按现行许可证重算 */
  compliant: boolean;
  deps: DepRef[];
}

export type BatchState = 'released' | 'withdrawn' | 'recovered';

/** 发行批次：同一产物的一次发布 */
export interface Batch {
  id: string;
  artifactId: string;
  version: string;
  channelIds: string[];
  releasedAt: number;
  /** 当前对外生效的快照 id */
  currentSnapshotId: string;
  state: BatchState;
  snapshots: Snapshot[];
}

/** 发行登记产物 */
export interface Artifact {
  id: string;
  name: string;
  code: string;
  owner: string;
  currentBatchId?: string;
  createdAt: number;
}

export type IncidentKind = 'revoked' | 'report';
export type IncidentStatus = 'open' | 'resolved';

/** 许可证事故：同一产物只允许存在一条待处置（open）事故 */
export interface Incident {
  id: string;
  artifactId: string;
  kind: IncidentKind;
  status: IncidentStatus;
  title: string;
  detail: string;
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
  /** 撤销类事故：被撤销许可证所影响的依赖（历史现场） */
  offendingDepKeys?: string[];
  /** 撤销类事故：受影响依赖覆盖的全部引用路径（恢复时必须被覆盖） */
  originalRefs?: string[];
  /** 撤回 / 回滚记录 */
  withdrawals: { batchId: string; reason: string; at: number }[];
  rollbacks: { batchId: string; fromSnapshotId: string; toSnapshotId: string; reason: string; at: number }[];
}

/** 分发渠道 */
export interface Channel {
  id: string;
  name: string;
  kind: string;
  region: string;
  contact: string;
}

/** 召回联系人 */
export interface RecallContact {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  slaHours: number;
}

/** 审计日志：处置动作全留痕 */
export interface AuditLog {
  id: string;
  at: number;
  action: string;
  detail: string;
}

export interface AppState {
  version: number;
  artifacts: Artifact[];
  batches: Batch[];
  incidents: Incident[];
  channels: Channel[];
  contacts: RecallContact[];
  licenses: LicenseInfo[];
  logs: AuditLog[];
}

/** 判定层统一返回结果 */
export type RuleResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: T } : { data: T }))
  | { ok: false; error: string };
