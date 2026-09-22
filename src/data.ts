// 数据层：初始登记数据（产物、渠道、依赖清单快照、召回联系人）。
// 仅负责“有哪些数据”，不含任何业务判定。

import type { AppState, DepRef } from './types';

const DAY = 86400000;
/** 以固定基准时间造种子，刷新后时间戳仍稳定；真实动作时间由调用方传入 Date.now() */
export const SEED_NOW = Date.UTC(2026, 8, 22, 9, 0, 0);
const t = (daysAgo: number, hour = 9): number => SEED_NOW - daysAgo * DAY + (hour - 9) * 3600000;

let depSeq = 0;
function dep(name: string, version: string, license: string, source: string, refs: string[]): DepRef {
  depSeq += 1;
  return { key: `dep-${depSeq}`, name, version, license, source, refs };
}

export function seedState(): AppState {
  depSeq = 0;

  const licenses: AppState['licenses'] = [
    { name: 'MIT', status: 'active' },
    { name: 'BSD-3-Clause', status: 'active' },
    { name: 'Apache-2.0', status: 'active' },
    { name: 'GPL-3.0', status: 'active', note: '分发义务需复核' },
    { name: 'Flow-商业许可-2019', status: 'revoked', revokedAt: t(3, 14), note: '授权方终止授权，所有版本立即停用' },
  ];

  // —— aurora-web：当前批次已被撤销许可证命中，存在一条待处置撤销事故 ——
  const aurSnap1: DepRef[] = [
    dep('react', '18.2.0', 'MIT', 'npm', ['src/main.tsx', 'src/router.tsx']),
    dep('lodash', '4.17.21', 'MIT', 'npm', ['src/utils/format.ts']),
    dep('flow-sdk', '3.1.0', 'Flow-商业许可-2019', '商业包仓库', ['src/analytics/flow.ts', 'src/analytics/init.ts']),
  ];
  const aurSnap2: DepRef[] = [
    dep('react', '18.3.1', 'MIT', 'npm', ['src/main.tsx', 'src/router.tsx']),
    dep('lodash', '4.17.21', 'MIT', 'npm', ['src/utils/format.ts']),
    dep('chart.js', '4.4.4', 'MIT', 'npm', ['src/dash/chart.ts']),
    dep('flow-sdk', '3.4.2', 'Flow-商业许可-2019', '商业包仓库', ['src/analytics/flow.ts', 'src/analytics/init.ts', 'src/analytics/report.ts']),
  ];
  const aurSnap3: DepRef[] = aurSnap2.map(d => ({ ...d, refs: [...d.refs] }));

  // —— helios-cli：当前批次含 GPL，收到一份合规举报事故 ——
  const helSnap1: DepRef[] = [
    dep('commander', '12.1.0', 'MIT', 'npm', ['src/cli/index.ts']),
    dep('legacy-parser', '2.1.0', 'GPL-3.0', '手动', ['src/parse/legacy.ts', 'src/parse/adapter.ts']),
    dep('chalk', '5.3.0', 'MIT', 'npm', ['src/cli/output.ts']),
  ];
  const helSnap0: DepRef[] = [
    dep('commander', '11.1.0', 'MIT', 'npm', ['src/cli/index.ts']),
    dep('in-house-parser', '1.4.0', 'BSD-3-Clause', '内部', ['src/parse/legacy.ts', 'src/parse/adapter.ts']),
    dep('chalk', '5.3.0', 'MIT', 'npm', ['src/cli/output.ts']),
  ];

  // —— nebula-mobile：历史事故已解除，批次已替代恢复 ——
  const nebSnap1: DepRef[] = [
    dep('flutter-engine', '3.22.0', 'BSD-3-Clause', 'pub', ['lib/main.dart']),
    dep('crypto-lite', '0.9.1', 'Apache-2.0', 'pub', ['lib/crypto/aes.dart']),
  ];
  const nebSnap0: DepRef[] = [
    dep('flutter-engine', '3.19.0', 'BSD-3-Clause', 'pub', ['lib/main.dart']),
  ];

  return {
    version: 1,
    licenses,
    channels: [
      { id: 'ch-web', name:'官网下载站', kind: 'Web', region: '全球', contact: 'release@aurora.example' },
      { id: 'ch-npm', name: 'npm 公共源', kind: 'Registry', region: '全球', contact: 'ops@aurora.example' },
      { id: 'ch-appstore', name: '企业应用商店', kind: 'Store', region: '中国大陆', contact: 'store-ops@aurora.example' },
      { id: 'ch-docker', name: '容器镜像仓库', kind: 'Registry', region: '全球', contact: 'ops@aurora.example' },
      { id: 'ch-cdn', name: '静态资源 CDN', kind: 'CDN', region: '亚太', contact: 'cdn@aurora.example' },
      { id: 'ch-partner', name: '合作伙伴镜像', kind: 'Partner', region: '欧洲', contact: 'partner@aurora.example' },
    ],
    contacts: [
      { id: 'ct-1', name: '周岚', role: '分发负责人', email: 'release@aurora.example', phone: '+86-10-8800-2333', slaHours: 2 },
      { id: 'ct-2', name: 'Marcus Reed', role: '法务合规（召回对接）', email: 'legal@aurora.example', phone: '+1-415-555-0162', slaHours: 8 },
    ],
    artifacts: [
      { id: 'art-aurora', name: 'Aurora Web 控制台', code: 'AURORA-WEB', owner: '前端平台组', currentBatchId: 'batch-aurora-240', createdAt: t(60) },
      { id: 'art-helios', name: 'Helios CLI', code: 'HELIOS-CLI', owner: '工具链组', currentBatchId: 'batch-helios-12', createdAt: t(48) },
      { id: 'art-nebula', name: 'Nebula Mobile SDK', code: 'NEBULA-MOB', owner: '移动端组', currentBatchId: 'batch-nebula-20', createdAt: t(30) },
    ],
    batches: [
      {
        id: 'batch-aurora-230', artifactId: 'art-aurora', version: '2.3.0', channelIds: ['ch-web', 'ch-cdn'],
        releasedAt: t(21), currentSnapshotId: 'snap-aurora-230', state: 'released',
        snapshots: [
          { id: 'snap-aurora-230', label: '2.3.0 发布快照', at: t(21), compliant: true, deps: aurSnap1.map(d => ({ ...d, refs: [...d.refs] })) },
        ],
      },
      {
        id: 'batch-aurora-240', artifactId: 'art-aurora', version: '2.4.0', channelIds: ['ch-web', 'ch-cdn', 'ch-partner'],
        releasedAt: t(9), currentSnapshotId: 'snap-aurora-240b', state: 'released',
        snapshots: [
          { id: 'snap-aurora-240a', label: '2.4.0 发布快照', at: t(9), compliant: true, deps: aurSnap2.map(d => ({ ...d, refs: [...d.refs] })) },
          { id: 'snap-aurora-240b', label: '2.4.0 热修快照', at: t(5), compliant: true, deps: aurSnap3 },
        ],
      },
      {
        id: 'batch-helios-12', artifactId: 'art-helios', version: '1.2.0', channelIds: ['ch-npm', 'ch-docker'],
        releasedAt: t(12), currentSnapshotId: 'snap-helios-12', state: 'released',
        snapshots: [
          { id: 'snap-helios-11', label: '1.1.0 发布快照', at: t(34), compliant: true, deps: helSnap0 },
          { id: 'snap-helios-12', label: '1.2.0 发布快照', at: t(12), compliant: true, deps: helSnap1 },
        ],
      },
      {
        id: 'batch-nebula-20', artifactId: 'art-nebula', version: '2.0.0', channelIds: ['ch-appstore'],
        releasedAt: t(18), currentSnapshotId: 'snap-nebula-20r', state: 'recovered',
        snapshots: [
          { id: 'snap-nebula-19', label: '1.0.0 发布快照', at: t(28), compliant: true, deps: nebSnap0 },
          { id: 'snap-nebula-20', label: '2.0.0 发布快照', at: t(18), compliant: true, deps: [] },
          { id: 'snap-nebula-20r', label: '2.0.0 替代恢复快照', at: t(16), compliant: true, deps: nebSnap1 },
        ],
      },
    ],
    incidents: [
      {
        id: 'inc-1001', artifactId: 'art-aurora', kind: 'revoked', status: 'open',
        title: 'Flow SDK 商业许可证被撤销',
        detail: '授权方 Flow Corp 发出终止函，Flow-商业许可-2019 项下所有版本授权立即终止，已分发批次须停止再分发并回滚。',
        createdAt: t(3, 14),
        offendingDepKeys: ['dep-3', 'dep-7'],
        originalRefs: ['src/analytics/flow.ts', 'src/analytics/init.ts', 'src/analytics/report.ts'],
        withdrawals: [], rollbacks: [],
      },
      {
        id: 'inc-1002', artifactId: 'art-helios', kind: 'report', status: 'open',
        title: 'GPL-3.0 依赖闭源分发合规举报',
        detail: '渠道收到外部举报：Helios CLI 1.2.0 静态链接 GPL-3.0 的 legacy-parser，却以闭源二进制分发，要求给出处置说明。',
        createdAt: t(1, 11),
        offendingDepKeys: ['dep-9'],
        originalRefs: ['src/parse/legacy.ts', 'src/parse/adapter.ts'],
        withdrawals: [], rollbacks: [],
      },
      {
        id: 'inc-0998', artifactId: 'art-nebula', kind: 'revoked', status: 'resolved',
        title: 'crypto-lite 0.9 授权条款变更（历史）',
        detail: 'crypto-lite 旧授权临时中止，已替换为 Apache-2.0 版本并恢复分发。',
        createdAt: t(20), resolvedAt: t(16),
        resolution: '替代依赖覆盖全部引用路径，整批恢复后解除。',
        offendingDepKeys: [], originalRefs: [],
        withdrawals: [{ batchId: 'batch-nebula-20', reason: '旧授权中止，先撤回待替换', at: t(19) }],
        rollbacks: [{ batchId: 'batch-nebula-20', fromSnapshotId: 'snap-nebula-20', toSnapshotId: 'snap-nebula-19', reason: '回退到最近合规快照等待替代依赖', at: t(19) }],
      },
    ],
    logs: [
      { id: 'log-seed-1', at: t(3, 14), action: '许可证撤销', detail: 'Flow-商业许可-2019 被标记为撤销；登记事故 inc-1001，产物 AURORA-WEB 冻结' },
      { id: 'log-seed-2', at: t(1, 11), action: '事故登记', detail: 'inc-1002 HELIOS-CLI GPL-3.0 合规举报' },
    ],
  };
}
