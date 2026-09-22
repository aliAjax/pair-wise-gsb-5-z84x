// 数据层：许可证事故回滚台的领域模型（只描述数据，不含判定与存储）

export type LicenseStatus = 'active' | 'revoked';

/** 依赖清单项（全局目录，撤销许可证作用于目录项） */
export interface Dep {
  id: string;
  name: string;
  version: string;
  license: string;
  source: string;
  /** 发布前兼容性：ok 可直接分发 / warn 需保留声明 / risk 强 copyleft 冲突 */
  status: 'ok' | 'warn' | 'risk';
  licenseStatus: LicenseStatus;
  revokedAt?: number;
  revokedReason?: string;
  note: string;
}

/** 召回联系人 */
export interface Contact {
  id: string;
  name: string;
  role: string;
  channel: string;
}

/** 批次清单中的一条依赖引用（path 为产物内引用路径） */
export interface ManifestEntry {
  depId: string;
  name: string;
  version: string;
  license: string;
  paths: string[];
}

export type ChannelType = 'npm' | 'cdn' | 'docker' | 'appstore' | 'internal';

export interface ReleaseChannel {
  id: string;
  type: ChannelType;
  name: string;
  location: string;
}

/** 发行登记产物 */
export interface Artifact {
  id: string;
  name: string;
  code: string;
  owner: string;
  contacts: Contact[];
}

export type SnapshotSource = 'publish' | 'rollback' | 'restore';

/** 合规快照：发布时留存 / 撤回回退时复制 / 整批恢复时重建 */
export interface Snapshot {
  id: string;
  artifactId: string;
  batchId: string;
  at: number;
  source: SnapshotSource;
  compliant: boolean;
  label: string;
  manifest: ManifestEntry[];
  /** rollback 快照记录撤回原因 */
  reason?: string;
}

/** 已发行批次（发行登记的载体） */
export interface Batch {
  id: string;
  artifactId: string;
  version: string;
  publishedAt: number;
  channels: ReleaseChannel[];
  /** 当前生效清单；撤回回退会用合规快照覆盖它 */
  manifest: ManifestEntry[];
  /** 发布时留存的快照 id */
  publishSnapshotId: string;
}

export type IncidentType = 'revocation' | 'violation';
export type IncidentStatus = 'open' | 'resolved';

/** 事故中受波及的依赖（仅许可证撤销事故） */
export interface AffectedDep {
  depId: string;
  name: string;
  version: string;
  license: string;
  batchIds: string[];
  paths: string[];
}

/** 替代依赖草稿：覆盖某个受波及依赖的某条引用路径 */
export interface ReplacementDraft {
  depId: string;
  path: string;
  targetDepId: string;
}

export interface Incident {
  id: string;
  type: IncidentType;
  title: string;
  detail: string;
  artifactId: string;
  batchIds: string[];
  status: IncidentStatus;
  createdAt: number;
  resolvedAt?: number;
  resolution?: string;
  affected: AffectedDep[];
  /** 已草拟的替代依赖覆盖（按 受波及依赖+引用路径 维度） */
  replacements: ReplacementDraft[];
  /** 每个批次撤回时回退到的合规快照 id */
  rollbacks: Record<string, string>;
  rollbackReason?: string;
}

export interface State {
  version: number;
  deps: Dep[];
  artifacts: Artifact[];
  batches: Batch[];
  snapshots: Snapshot[];
  incidents: Incident[];
}
