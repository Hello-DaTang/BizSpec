import { join, relative, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
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

const CONFIG_DIR = '.bizspec';
const CONFIG_FILE = 'config.json';
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

function configPath(projectRoot) {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILE);
}

export async function readConfig(projectRoot) {
  const path = configPath(projectRoot);
  if (!(await exists(path))) return null;
  return readJson(path);
}

export async function writeConfig(projectRoot, config) {
  await writeJson(configPath(projectRoot), config);
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
    ` 业务资料位于项目的 BizSpec workspace，更新 Skill 时不得覆盖其中的节点和登记簿。\n`;
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
  const existing = await readConfig(projectRoot);
  const version = await packageVersion();
  const now = nowIso();
  const config = {
    schemaVersion: 1,
    package: '@hello-datang/bizspec',
    cliVersion: version,
    workspace: workspace ?? existing?.workspace ?? null,
    tools: normalizeTools(tools),
    installedSkills,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeConfig(projectRoot, config);
  return config;
}

export async function updateInstalledSkills(projectRoot, { force = false } = {}) {
  const config = await readConfig(projectRoot);
  if (!config) {
    throw new Error('No .bizspec/config.json found. Run `bizspec init` or `bizspec install` first.');
  }
  const installedSkills = await installSkills(projectRoot, config.tools, { force });
  return initializeOrUpdateConfig(projectRoot, {
    tools: config.tools,
    installedSkills,
    workspace: config.workspace,
  });
}

export async function uninstallSkills(projectRoot, { purge = false } = {}) {
  const config = await readConfig(projectRoot);
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
  if (purge && config.workspace) {
    await removePath(resolve(projectRoot, config.workspace));
    workspaceRemoved = true;
  }
  await removePath(join(projectRoot, CONFIG_DIR));
  return { removed, workspaceRemoved };
}
