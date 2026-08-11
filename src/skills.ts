import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import {
  ALL_STANDARD_TOOLS,
  DEFAULT_TOOLS,
  TOOL_ALIASES,
  TOOL_TARGETS,
} from './constants.js';
import {
  PACKAGE_ROOT,
  copyTree,
  ensureDir,
  exists,
  listFiles,
  nowIso,
  readJson,
  removePath,
  writeJson,
} from './files.js';
import type {
  InstalledSkill,
  InstallerConfig,
  SkillInstallOptions,
  ToolName,
} from './types.js';

const DEFAULT_WORKSPACE = 'bizspec';
const CONFIG_FILE = 'config.json';
const LEGACY_CONFIG_DIR = '.bizspec';
const LEGACY_CONFIG_FILE = 'config.json';
const SKILL_MARKER = '.bizspec-managed.json';
const PACKAGE_NAME = '@hello-datang/bizspec' as const;

interface UpdateConfigInput {
  tools: string[] | ToolName[];
  installedSkills: InstalledSkill[];
  workspace?: string | null;
}

interface UpdateSkillsOptions extends SkillInstallOptions {
  workspace?: string | null;
}

interface UninstallOptions {
  purge?: boolean;
  workspace?: string | null;
}

export interface UninstallResult {
  removed: string[];
  workspaceRemoved: boolean;
}

function isToolName(value: string): value is ToolName {
  return Object.prototype.hasOwnProperty.call(TOOL_TARGETS, value);
}

export function canonicalTool(value: string): string {
  const normalized = value.trim().toLowerCase();
  return TOOL_ALIASES[normalized] ?? normalized;
}

export function normalizeTools(values: readonly string[]): ToolName[] {
  const flattened = values
    .flatMap((value) => String(value).split(','))
    .map(canonicalTool)
    .filter(Boolean);
  const expanded = flattened.includes('all')
    ? [...ALL_STANDARD_TOOLS]
    : flattened;
  const unique = [...new Set(expanded)];
  for (const tool of unique) {
    if (!isToolName(tool)) {
      throw new Error(`Unsupported tool: ${tool}. Supported: ${Object.keys(TOOL_TARGETS).join(', ')}, all`);
    }
  }
  return unique as ToolName[];
}

export async function detectTools(projectRoot: string): Promise<ToolName[]> {
  const detections: readonly [ToolName, string][] = [
    ['codex', '.agents'],
    ['codex-compat', '.codex/skills'],
    ['claude', '.claude'],
    ['copilot', '.github/skills'],
    ['cursor', '.cursor'],
  ];
  const result: ToolName[] = [];
  for (const [tool, path] of detections) {
    if (await exists(join(projectRoot, path))) result.push(tool);
  }
  return result;
}

export function defaultTools(): ToolName[] {
  return [...DEFAULT_TOOLS];
}

function configPath(projectRoot: string, workspace = DEFAULT_WORKSPACE): string {
  return join(projectRoot, workspace, CONFIG_FILE);
}

function legacyConfigPath(projectRoot: string): string {
  return join(projectRoot, LEGACY_CONFIG_DIR, LEGACY_CONFIG_FILE);
}

function isManagedConfig(value: unknown): value is InstallerConfig {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.package === PACKAGE_NAME && Array.isArray(record.tools) && Array.isArray(record.installedSkills);
}

async function readManagedConfig(path: string): Promise<InstallerConfig | null> {
  if (!(await exists(path))) return null;
  const config = await readJson<unknown>(path);
  return isManagedConfig(config) ? config : null;
}

async function discoverWorkspaceConfig(projectRoot: string): Promise<InstallerConfig | null> {
  const defaultConfig = await readManagedConfig(configPath(projectRoot));
  if (defaultConfig) return defaultConfig;

  if (!(await exists(projectRoot))) return null;
  const entries = await readdir(projectRoot, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    if (['.git', 'node_modules', LEGACY_CONFIG_DIR].includes(entry.name)) continue;
    const config = await readManagedConfig(configPath(projectRoot, entry.name));
    if (config) return config;
  }
  return null;
}

async function migrateLegacyConfig(
  projectRoot: string,
  requestedWorkspace: string | null = null,
): Promise<InstallerConfig | null> {
  const legacyPath = legacyConfigPath(projectRoot);
  if (!(await exists(legacyPath))) return null;

  const legacy = await readJson<Record<string, unknown>>(legacyPath);
  if (legacy.package !== PACKAGE_NAME) return null;
  const workspace = requestedWorkspace ??
    (typeof legacy.workspace === 'string' && legacy.workspace ? legacy.workspace : DEFAULT_WORKSPACE);
  const now = nowIso();
  const migrated: InstallerConfig = {
    schemaVersion: 2,
    package: PACKAGE_NAME,
    cliVersion: typeof legacy.cliVersion === 'string' ? legacy.cliVersion : 'unknown',
    workspace,
    tools: normalizeTools(Array.isArray(legacy.tools) ? legacy.tools.map(String) : []),
    installedSkills: Array.isArray(legacy.installedSkills)
      ? legacy.installedSkills as InstalledSkill[]
      : [],
    createdAt: typeof legacy.createdAt === 'string' ? legacy.createdAt : now,
    updatedAt: typeof legacy.updatedAt === 'string' ? legacy.updatedAt : now,
    migratedFrom: `${LEGACY_CONFIG_DIR}/${LEGACY_CONFIG_FILE}`,
    migratedAt: now,
  };
  await writeJson(configPath(projectRoot, workspace), migrated);
  await removePath(join(projectRoot, LEGACY_CONFIG_DIR));
  return migrated;
}

export async function readConfig(
  projectRoot: string,
  workspace: string | null = null,
): Promise<InstallerConfig | null> {
  if (workspace) {
    const direct = await readManagedConfig(configPath(projectRoot, workspace));
    if (direct) return direct;
  } else {
    const discovered = await discoverWorkspaceConfig(projectRoot);
    if (discovered) return discovered;
  }
  return migrateLegacyConfig(projectRoot, workspace);
}

export async function writeConfig(projectRoot: string, config: InstallerConfig): Promise<void> {
  const workspace = config.workspace ?? DEFAULT_WORKSPACE;
  await writeJson(configPath(projectRoot, workspace), { ...config, workspace });
}

async function packageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

async function installOneSkill(
  projectRoot: string,
  tool: ToolName,
  { force = false }: SkillInstallOptions = {},
): Promise<InstalledSkill> {
  const relativeTarget = TOOL_TARGETS[tool];
  const target = resolve(projectRoot, relativeTarget);
  const markerPath = join(target, SKILL_MARKER);
  const targetExists = await exists(target);
  const managed = targetExists && await exists(markerPath);

  if (targetExists && !managed && !force) {
    throw new Error(
      `${relativeTarget} already exists and is not managed by BizSpec. ` +
      'Use --force only after reviewing that directory.',
    );
  }

  await ensureDir(target);
  const sourceSkill = await readFile(join(PACKAGE_ROOT, 'SKILL.md'), 'utf8');
  const cliSection = `\n\n## 项目内 CLI\n\n` +
    `本 Skill 由 BizSpec CLI 安装。优先在项目根目录执行：\n\n` +
    '```text\n' +
    'bizspec status\n' +
    'bizspec next\n' +
    'bizspec validate\n' +
    'bizspec set-status BS-xx <status> --reason "原因"\n' +
    '```\n\n' +
    `若未全局安装，可使用 \`npx -y github:Hello-DaTang/BizSpec <command>\`。` +
    ` 业务资料和安装器配置都位于项目的 BizSpec workspace；更新 Skill 时不得覆盖其中的节点和登记簿。\n`;
  await writeFile(join(target, 'SKILL.md'), `${sourceSkill.trimEnd()}${cliSection}`, 'utf8');
  await copyTree(join(PACKAGE_ROOT, 'references'), join(target, 'references'));
  await copyTree(join(PACKAGE_ROOT, 'agents'), join(target, 'agents'));

  const version = await packageVersion();
  const files = (await listFiles(target)).filter((path) => path !== SKILL_MARKER);
  await writeJson(markerPath, {
    schemaVersion: 1,
    package: PACKAGE_NAME,
    version,
    tool,
    installedAt: nowIso(),
    files,
  });

  return {
    tool,
    path: relative(projectRoot, target).replaceAll('\\', '/'),
    files: files.length,
  };
}

export async function installSkills(
  projectRoot: string,
  tools: readonly string[],
  options: SkillInstallOptions = {},
): Promise<InstalledSkill[]> {
  const normalized = normalizeTools(tools);
  if (normalized.length === 0) throw new Error('At least one tool must be selected.');
  const installed: InstalledSkill[] = [];
  for (const tool of normalized) {
    installed.push(await installOneSkill(projectRoot, tool, options));
  }
  return installed;
}

export async function initializeOrUpdateConfig(
  projectRoot: string,
  { tools, installedSkills, workspace = null }: UpdateConfigInput,
): Promise<InstallerConfig> {
  const existing = await readConfig(projectRoot, workspace);
  const version = await packageVersion();
  const now = nowIso();
  const resolvedWorkspace = workspace ?? existing?.workspace ?? DEFAULT_WORKSPACE;
  const config: InstallerConfig = {
    schemaVersion: 2,
    package: PACKAGE_NAME,
    cliVersion: version,
    workspace: resolvedWorkspace,
    tools: normalizeTools(tools),
    installedSkills,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeConfig(projectRoot, config);
  return config;
}

export async function updateInstalledSkills(
  projectRoot: string,
  { force = false, workspace = null }: UpdateSkillsOptions = {},
): Promise<InstallerConfig> {
  const config = await readConfig(projectRoot, workspace);
  if (!config) {
    throw new Error('No BizSpec workspace config found. Run `bizspec init` or `bizspec install` first.');
  }
  const installedSkills = await installSkills(projectRoot, config.tools, { force });
  return initializeOrUpdateConfig(projectRoot, {
    tools: config.tools,
    installedSkills,
    workspace: config.workspace,
  });
}

export async function uninstallSkills(
  projectRoot: string,
  { purge = false, workspace = null }: UninstallOptions = {},
): Promise<UninstallResult> {
  const config = await readConfig(projectRoot, workspace);
  if (!config) return { removed: [], workspaceRemoved: false };
  const removed: string[] = [];
  for (const item of config.installedSkills ?? []) {
    const target = resolve(projectRoot, item.path);
    const marker = join(target, SKILL_MARKER);
    if (await exists(marker)) {
      await removePath(target);
      removed.push(item.path);
    }
  }

  let workspaceRemoved = false;
  const resolvedWorkspace = config.workspace ?? DEFAULT_WORKSPACE;
  if (purge) {
    await removePath(resolve(projectRoot, resolvedWorkspace));
    workspaceRemoved = true;
  } else {
    await removePath(configPath(projectRoot, resolvedWorkspace));
  }
  await removePath(join(projectRoot, LEGACY_CONFIG_DIR));
  return { removed, workspaceRemoved };
}
