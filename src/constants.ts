import type { NodeCatalogItem, NodeStatus, ToolName } from './types.js';

export const SCHEMA_VERSION = 'bizspec/v1' as const;

export const NODE_STATUSES: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  'not_started',
  'in_progress',
  'blocked',
  'review_required',
  'done',
  'waived',
]);

export const TERMINAL_NODE_STATUSES: ReadonlySet<NodeStatus> = new Set<NodeStatus>([
  'done',
  'waived',
]);

export const NODE_CATALOG: readonly NodeCatalogItem[] = [
  { id: 'BS-01', title: '项目范围与业务目标', filename: 'BS-01-scope.md', dependsOn: [] },
  { id: 'BS-02', title: '业务资料与真实案例', filename: 'BS-02-evidence.md', dependsOn: ['BS-01'] },
  { id: 'BS-03', title: '角色与业务责任', filename: 'BS-03-roles.md', dependsOn: ['BS-01'] },
  { id: 'BS-04', title: '当前业务流程还原', filename: 'BS-04-as-is-process.md', dependsOn: ['BS-02', 'BS-03'] },
  { id: 'BS-05', title: '数据源与字段映射', filename: 'BS-05-data-mapping.md', dependsOn: ['BS-02'] },
  { id: 'BS-06', title: '业务术语与数据字典', filename: 'BS-06-glossary.md', dependsOn: ['BS-02', 'BS-05'] },
  { id: 'BS-07', title: '业务规则与计算规则', filename: 'BS-07-rules.md', dependsOn: ['BS-05', 'BS-06'] },
  { id: 'BS-08', title: '异常场景与处理方式', filename: 'BS-08-exceptions.md', dependsOn: ['BS-04', 'BS-07'] },
  { id: 'BS-09', title: '目标业务流程', filename: 'BS-09-to-be-process.md', dependsOn: ['BS-04', 'BS-08'] },
  { id: 'BS-10', title: '业务对象状态模型', filename: 'BS-10-state-model.md', dependsOn: ['BS-09'] },
  { id: 'BS-11', title: '第一阶段范围与验收场景', filename: 'BS-11-acceptance.md', dependsOn: ['BS-09', 'BS-10'] },
  { id: 'BS-12', title: '开发就绪检查', filename: 'BS-12-readiness.md', dependsOn: ['BS-05', 'BS-07', 'BS-08', 'BS-10', 'BS-11'] },
];

export const NODE_BY_ID: ReadonlyMap<string, NodeCatalogItem> = new Map(
  NODE_CATALOG.map((node) => [node.id, node]),
);

export const TOOL_TARGETS: Readonly<Record<ToolName, string>> = {
  codex: '.agents/skills/bizspec',
  'codex-compat': '.codex/skills/bizspec',
  claude: '.claude/skills/bizspec',
  copilot: '.github/skills/bizspec',
  cursor: '.cursor/skills/bizspec',
  generic: '.skills/bizspec',
};

export const TOOL_ALIASES: Readonly<Record<string, ToolName>> = {
  openai: 'codex',
  chatgpt: 'codex',
  'codex-legacy': 'codex-compat',
  'codex-openspec': 'codex-compat',
  github: 'copilot',
  'github-copilot': 'copilot',
};

export const DEFAULT_TOOLS: readonly ToolName[] = ['codex', 'claude'];
export const ALL_STANDARD_TOOLS: readonly ToolName[] = ['codex', 'claude', 'copilot', 'cursor'];
