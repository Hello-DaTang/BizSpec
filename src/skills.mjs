import { join, relative, resolve } from 'node:path';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import {
  ALL_STANDARD_TOOLS,
  DEFAULT_TOOLS,
  TOOL_ALIASES,
  TOOL_TARGETS,
} from './constants.mjs';
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
} from './files.mjs';

const DEFAULT_WORKSPACE = 'bizspec';
const CONFIG_FILE = 'config.json';
const LEGACY_CONFIG_DIR = '.bizspec';
const LEGACY_CONFIG_FILE = 'config.json';
const SKILL_MARKER = '.bizspec-managed.json';

export function canonicalTool(value) {
  const normalized = value.trim().toLowerCase();
  return TOOL_ALIASES[normalized] ?? normalized;
}

export function normalizeTools(values) {
  const flattened = values
    .flatMap((value) => String(value).split(','))
    .map(canonicalTool)
    .filter(Boolean);
  const expanded = flattened.includes('all')
    ? [...ALL_STANDARD_TOOLS]
    : flattened;
  const unique = [...new Set(expanded)];
  for (const tool of unique) {
    if (!(tool in TOOL_TARGETS)) {
      throw new Error(`Unsupported tool: ${tool}. Supported: ${Object.keys(TOOL_TARGETS).join(', ')}, all`);
    }
  }
  return unique;
}

export async function detectTools(projectRoot) {
  const detections = [
    ['codex', '.agents'],
    ['codex-compat', '.codex/skills'],
    ['claude', '.claude'],
    ['copilot', '.github/skills'],
    ['cursor', '.cursor'],
  ];
  const result = [];
  for (const [tool, path] of detections) {
    if (await exists(join(projectRoot, path))) result.push(tool);
  }
  return result;
}

export function defaultTools() {
  return [...DEFAULT_TOOLS];
}

function configPath(projectRoot, workspace = DEFAULT_WORKSPACE) {
  return join(projectRoot, workspace, CONFIG_FILE);
}

function legacyConfigPath(projectRoot) {
  return join(projectRoot, LEGACY_CONFIG_DIR, LEGACY_CONFIG_FILE);
}

async function readManagedConfig(path) {
  if (!(await exists(path))) return null;
  const config = await readJson(path);
  if (config?.package !== '@hello-datang/bizspec') return null;
  return config;
}

async function discoverWorkspaceConfig(projectRoot) {
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

async function migrateLegacyConfig(projectRoot, requestedWorkspace = null) {
  const legacyPath = legacyConfigPath(projectRoot);
  if (!(await exists(legacyPath))) return null;

  const legacy = await readJson(legacyPath);
  const workspace = requestedWorkspace ?? legacy.workspace ?? DEFAULT_WORKSPACE;
  const migrated = {
    ...legacy,
    workspace,
    migratedFrom: `${LEGACY_CONFIG_DIR}/${LEGACY_CONFIG_FILE}`,
    migratedAt: nowIso(),
  };
  await writeJson(configPath(projectRoot, workspace), migrated);
  await removePath(join(projectRoot, LEGACY_CONFIG_DIR));
  return migrated;
}

export async function readConfig(projectRoot, workspace = null) {
  if (workspace) {
    const direct = await readManagedConfig(configPath(projectRoot, workspace));
    if (direct) return direct;
  } else {
    const discovered = await discoverWorkspaceConfig(projectRoot);
    if (discovered) return discovered;
  }
  return migrateLegacyConfig(projectRoot, workspace);
}

export async function writeConfig(projectRoot, config) {
  const workspace = config.workspace ?? DEFAULT_WORKSPACE;
  await writeJson(configPath(projectRoot, workspace), { ...config, workspace });
}

async function packageVersion() {
  const pkg = JSON.parse(await readFile(join(PACKAGE_ROOT, 'package.json'), 'utf8'));
  return pkg.version;
}

async function installOneSkill(projectRoot, tool, { force = false } = {}) {
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
    package: '@hello-datang/bizspec',
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

export async function installSkills(projectRoot, tools, options = {}) {
  const normalized = normalizeTools(tools);
  if (normalized.length === 0) throw new Error('At least one tool must be selected.');
  const installed = [];
  for (const tool of normalized) {
    installed.push(await installOneSkill(projectRoot, tool, options));
  }
  return installed;
}

export async function initializeOrUpdateConfig(projectRoot, {
  tools,
  installedSkills,
  workspace = null,
}) {
  const existing = await readConfig(projectRoot, workspace);
  const version = await packageVersion();
  const now = nowIso();
  const resolvedWorkspace = workspace ?? existing?.workspace ?? DEFAULT_WORKSPACE;
  const config = {
    schemaVersion: 2,
    package: '@hello-datang/bizspec',
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

export async function updateInstalledSkills(projectRoot, {
  force = false,
  workspace = null,
} = {}) {
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

export async function uninstallSkills(projectRoot, {
  purge = false,
  workspace = null,
} = {}) {
  const config = await readConfig(projectRoot, workspace);
  if (!config) return { removed: [], workspaceRemoved: false };
  const removed = [];
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
