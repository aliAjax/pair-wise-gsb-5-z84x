// 数据层：初始数据与标识工具（演示用发行登记样本）

import type {State} from './types';

export const uid = (p: string): string =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const T = {
  v10: Date.parse('2026-08-18T03:20:00Z'),
  v11: Date.parse('2026-09-12T08:40:00Z'),
  v042: Date.parse('2026-09-02T06:10:00Z'),
  inc: Date.parse('2026-09-15T10:05:00Z'),
  oldInc: Date.parse('2026-07-03T09:00:00Z'),
  oldRes: Date.parse('2026-07-05T14:30:00Z'),
};

export const initialState: State = {
  version: 1,
  deps: [
    {id:'d-react',name:'react',version:'18.3.1',license:'MIT',source:'npm',status:'ok',licenseStatus:'active',note:'宽松许可，可商用'},
    {id:'d-lodash',name:'lodash',version:'4.17.21',license:'MIT',source:'npm',status:'ok',licenseStatus:'active',note:'宽松许可，可商用'},
    {id:'d-chart',name:'chart.js',version:'4.4.4',license:'MIT',source:'npm',status:'ok',licenseStatus:'active',note:'宽松许可，可商用'},
    {id:'d-hljs',name:'highlight.js',version:'11.10.0',license:'BSD-3-Clause',source:'npm',status:'warn',licenseStatus:'active',note:'再发布需保留版权声明'},
    {id:'d-datefns',name:'date-fns',version:'3.6.0',license:'MIT',source:'npm',status:'ok',licenseStatus:'active',note:'宽松许可，可商用'},
    {id:'d-zlib',name:'tiny-zip',version:'0.9.3',license:'BSD-3-Clause',source:'npm',status:'warn',licenseStatus:'active',note:'再发布需保留版权声明'},
    {
      id:'d-legacy',name:'legacy-parser',version:'2.1.0',license:'GPL-3.0',source:'手动',status:'risk',
      licenseStatus:'revoked',revokedAt:T.inc,revokedReason:'上游授权方终止商业分发授权（2026-09-15 通知）',
      note:'可能与闭源分发冲突；许可证已被撤销',
    },
    {id:'d-modern',name:'modern-parser',version:'4.0.2',license:'MIT',source:'npm',status:'ok',licenseStatus:'active',note:'宽松许可，可商用，API 与 legacy-parser 兼容'},
  ],
  artifacts: [
    {
      id:'a-aurora',name:'Aurora Web',code:'AURORA-WEB',owner:'前端平台组',
      contacts:[
        {id:'c-1',name:'Zen Li',role:'发布负责人',channel:'zen.li@example.com'},
        {id:'c-2',name:'合规值班',role:'法务联系人',channel:'legal-oncall@example.com'},
      ],
    },
    {
      id:'a-nebula',name:'Nebula CLI',code:'NEBULA-CLI',owner:'开发者工具组',
      contacts:[
        {id:'c-3',name:'Mara Qiu',role:'发布负责人',channel:'mara.qiu@example.com'},
      ],
    },
  ],
  batches: [
    {
      id:'b-aw-100',artifactId:'a-aurora',version:'1.0.0',publishedAt:T.v10,
      channels:[
        {id:'ch-1',type:'cdn',name:'官方 CDN',location:'cdn.example.com/aurora-web/1.0.0'},
        {id:'ch-2',type:'npm',name:'npm 镜像',location:'@example/aurora-web@1.0.0'},
      ],
      manifest:[
        {depId:'d-react',name:'react',version:'18.3.1',license:'MIT',paths:['src/main.tsx','src/app/router.tsx']},
        {depId:'d-lodash',name:'lodash',version:'4.17.21',license:'MIT',paths:['src/app/format.ts']},
        {depId:'d-chart',name:'chart.js',version:'4.4.4',license:'MIT',paths:['src/views/dashboard.tsx']},
        {depId:'d-hljs',name:'highlight.js',version:'11.10.0',license:'BSD-3-Clause',paths:['src/views/code-view.tsx']},
      ],
      publishSnapshotId:'s-aw-100',
    },
    {
      id:'b-aw-110',artifactId:'a-aurora',version:'1.1.0',publishedAt:T.v11,
      channels:[
        {id:'ch-3',type:'cdn',name:'官方 CDN',location:'cdn.example.com/aurora-web/1.1.0'},
        {id:'ch-4',type:'npm',name:'npm 镜像',location:'@example/aurora-web@1.1.0'},
        {id:'ch-5',type:'docker',name:'Docker Hub',location:'example/aurora-web:1.1.0'},
      ],
      manifest:[
        {depId:'d-react',name:'react',version:'18.3.1',license:'MIT',paths:['src/main.tsx','src/app/router.tsx']},
        {depId:'d-lodash',name:'lodash',version:'4.17.21',license:'MIT',paths:['src/app/format.ts']},
        {depId:'d-chart',name:'chart.js',version:'4.4.4',license:'MIT',paths:['src/views/dashboard.tsx']},
        {depId:'d-hljs',name:'highlight.js',version:'11.10.0',license:'BSD-3-Clause',paths:['src/views/code-view.tsx']},
        {depId:'d-legacy',name:'legacy-parser',version:'2.1.0',license:'GPL-3.0',paths:['src/services/parse.ts','src/workers/import.worker.ts']},
      ],
      publishSnapshotId:'s-aw-110',
    },
    {
      id:'b-neb-042',artifactId:'a-nebula',version:'0.4.2',publishedAt:T.v042,
      channels:[
        {id:'ch-6',type:'npm',name:'npm Registry',location:'@example/nebula-cli@0.4.2'},
        {id:'ch-7',type:'appstore',name:'内部制品库',location:'artifacts.example.com/nebula-cli/0.4.2'},
      ],
      manifest:[
        {depId:'d-datefns',name:'date-fns',version:'3.6.0',license:'MIT',paths:['src/cmd/schedule.ts']},
        {depId:'d-zlib',name:'tiny-zip',version:'0.9.3',license:'BSD-3-Clause',paths:['src/pkg/archive.ts']},
      ],
      publishSnapshotId:'s-neb-042',
    },
  ],
  snapshots: [
    {id:'s-aw-100',artifactId:'a-aurora',batchId:'b-aw-100',at:T.v10,source:'publish',compliant:true,label:'1.0.0 发布快照',manifest:[
      {depId:'d-react',name:'react',version:'18.3.1',license:'MIT',paths:['src/main.tsx','src/app/router.tsx']},
      {depId:'d-lodash',name:'lodash',version:'4.17.21',license:'MIT',paths:['src/app/format.ts']},
      {depId:'d-chart',name:'chart.js',version:'4.4.4',license:'MIT',paths:['src/views/dashboard.tsx']},
      {depId:'d-hljs',name:'highlight.js',version:'11.10.0',license:'BSD-3-Clause',paths:['src/views/code-view.tsx']},
    ]},
    {id:'s-aw-110',artifactId:'a-aurora',batchId:'b-aw-110',at:T.v11,source:'publish',compliant:false,label:'1.1.0 发布快照',manifest:[
      {depId:'d-react',name:'react',version:'18.3.1',license:'MIT',paths:['src/main.tsx','src/app/router.tsx']},
      {depId:'d-lodash',name:'lodash',version:'4.17.21',license:'MIT',paths:['src/app/format.ts']},
      {depId:'d-chart',name:'chart.js',version:'4.4.4',license:'MIT',paths:['src/views/dashboard.tsx']},
      {depId:'d-hljs',name:'highlight.js',version:'11.10.0',license:'BSD-3-Clause',paths:['src/views/code-view.tsx']},
      {depId:'d-legacy',name:'legacy-parser',version:'2.1.0',license:'GPL-3.0',paths:['src/services/parse.ts','src/workers/import.worker.ts']},
    ]},
    {id:'s-neb-042',artifactId:'a-nebula',batchId:'b-neb-042',at:T.v042,source:'publish',compliant:true,label:'0.4.2 发布快照',manifest:[
      {depId:'d-datefns',name:'date-fns',version:'3.6.0',license:'MIT',paths:['src/cmd/schedule.ts']},
      {depId:'d-zlib',name:'tiny-zip',version:'0.9.3',license:'BSD-3-Clause',paths:['src/pkg/archive.ts']},
    ]},
  ],
  incidents: [
    {
      id:'i-legacy',type:'revocation',
      title:'legacy-parser 许可证撤销',
      detail:'上游授权方终止商业分发授权。Aurora Web 1.1.0 批次中 2 条引用路径使用该依赖，产物已冻结，须撤回并替代后恢复。',
      artifactId:'a-aurora',batchIds:['b-aw-110'],status:'open',createdAt:T.inc,
      affected:[
        {depId:'d-legacy',name:'legacy-parser',version:'2.1.0',license:'GPL-3.0',batchIds:['b-aw-110'],paths:['src/services/parse.ts','src/workers/import.worker.ts']},
      ],
      replacements:[],rollbacks:{},
    },
    {
      id:'i-old',type:'violation',
      title:'tiny-zip 版权声明遗漏（历史事故）',
      detail:'0.3.x 批次再分发时遗漏 BSD-3-Clause 版权声明，补充 NOTICE 后解除。',
      artifactId:'a-nebula',batchIds:['b-neb-042'],status:'resolved',createdAt:T.oldInc,resolvedAt:T.oldRes,resolution:'已在 NOTICE 文件补全版权声明并重新发布 0.4.2',
      affected:[],replacements:[],rollbacks:{},
    },
  ],
};
