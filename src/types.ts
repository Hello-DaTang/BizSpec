export type NodeStatus =
  | 'not_started'
  | 'in_progress'
  | 'blocked'
  | 'review_required'
  | 'done'
  | 'waived';

export type ToolName =
  | 'codex'
  | 'codex-compat'
  | 'claude'
  | 'copilot'
  | 'cursor'
  | 'generic';

export interface NodeCatalogItem {
  id: string;
  title: string;
  filename: string;
  dependsOn: string[];
}

export interface CompletionCheck {
  required_sections_present: boolean;
  required_outputs_present: boolean;
  critical_items_have_owner: boolean;
  critical_blockers_resolved: boolean;
  reviewer_confirmed: boolean;
  [key: string]: boolean;
}

export interface NodeMeta {
  id: string;
  title: string;
  status: NodeStatus;
  owner: string | null;
  reviewers: string[];
  depends_on: string[];
  inputs: unknown[];
  outputs: unknown[];
  blockers: unknown[];
  completion_check: CompletionCheck;
  updated_at: string | null;
  [key: string]: unknown;
}

export interface WorkflowHistoryItem {
  at: string;
  from: NodeStatus;
  to: NodeStatus;
  reason: string;
}

export interface WorkflowNode {
  id: string;
  title: string;
  status: NodeStatus;
  depends_on: string[];
  blockers: unknown[];
  owner: string | null;
  reviewers: string[];
  updated_at: string | null;
  history: WorkflowHistoryItem[];
  [key: string]: unknown;
}

export interface ProjectInfo {
  id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface Manifest {
  schema_version: string;
  project: ProjectInfo;
  sources: unknown[];
  workflow: WorkflowNode[];
  [key: string]: unknown;
}

export interface InstalledSkill {
  tool: ToolName;
  path: string;
  files: number;
}

export interface InstallerConfig {
  schemaVersion: number;
  package: '@hello-datang/bizspec';
  cliVersion: string;
  workspace: string;
  tools: ToolName[];
  installedSkills: InstalledSkill[];
  createdAt: string;
  updatedAt: string;
  migratedFrom?: string;
  migratedAt?: string;
  [key: string]: unknown;
}

export interface SkillInstallOptions {
  force?: boolean;
}

export interface CliOptions {
  title?: string;
  id?: string;
  tools?: string;
  workspace?: string;
  yes?: boolean;
  force?: boolean;
  purge?: boolean;
  reason?: string;
  help?: boolean;
  [key: string]: string | boolean | undefined;
}

export type YamlScalar = string | number | boolean | null;
export type YamlValue = YamlScalar | YamlObject | YamlValue[];
export interface YamlObject {
  [key: string]: YamlValue;
}
