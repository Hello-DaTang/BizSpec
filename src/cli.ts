import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { PACKAGE_ROOT } from './files.js';
import {
  initializeWorkspace,
  nextNode,
  projectStatus,
  setNodeStatus,
  validateProject,
} from './project.js';
import {
  defaultTools,
  detectTools,
  initializeOrUpdateConfig,
  installSkills,
  normalizeTools,
  readConfig,
  uninstallSkills,
  updateInstalledSkills,
} from './skills.js';
import type { CliOptions, ToolName } from './types.js';

interface ParsedArgs {
  positionals: string[];
  options: CliOptions;
}

function usage(): string {
  return `BizSpec CLI

Usage:
  bizspec init [path] [--title <title>] [--id <id>] [--tools <list>] [--workspace <dir>] [--yes] [--force]
  bizspec install [path] [--tools <list>] [--workspace <dir>] [--yes] [--force]
  bizspec update [path] [--workspace <dir>] [--force]
  bizspec uninstall [path] [--workspace <dir>] [--purge]
  bizspec status [path] [--workspace <dir>]
  bizspec next [path] [--workspace <dir>]
  bizspec validate [path] [--workspace <dir>]
  bizspec set-status [path] <node-id> <status> --reason <text>
  bizspec version

Tools:
  codex          -> .agents/skills/bizspec (OpenAI official repo-scoped path)
  codex-compat   -> .codex/skills/bizspec (OpenSpec/legacy compatibility)
  claude         -> .claude/skills/bizspec
  copilot        -> .github/skills/bizspec
  cursor         -> .cursor/skills/bizspec
  generic        -> .skills/bizspec
  all            -> codex, claude, copilot, cursor

Project files:
  bizspec/config.json stores installer state for update/uninstall.
  Legacy .bizspec/config.json is migrated automatically.

Examples:
  npx -y github:Hello-DaTang/BizSpec init
  npx -y github:Hello-DaTang/BizSpec install --tools codex,claude
  npx -y github:Hello-DaTang/BizSpec install --tools codex-compat,copilot
  bizspec update
`;
}

function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [rawKey = '', inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  return { positionals, options };
}

async function version(): Promise<string> {
  const pkg = JSON.parse(await readFile(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

async function resolveTools(projectRoot: string, options: CliOptions): Promise<ToolName[]> {
  if (typeof options.tools === 'string') return normalizeTools([options.tools]);
  const detected = await detectTools(projectRoot);
  if (options.yes || !process.stdin.isTTY) return detected.length > 0 ? detected : defaultTools();

  const rl = createInterface({ input, output });
  try {
    const hint = detected.length > 0 ? detected.join(',') : defaultTools().join(',');
    const answer = await rl.question(
      `安装到哪些工具？[codex,codex-compat,claude,copilot,cursor,generic,all]\n` +
      `直接回车使用 ${hint}: `,
    );
    return normalizeTools([answer.trim() || hint]);
  } finally {
    rl.close();
  }
}

function rootFrom(value: string | undefined): string {
  return resolve(value || '.');
}

function workspaceOption(options: CliOptions): string | null {
  return typeof options.workspace === 'string' ? options.workspace : null;
}

async function commandInit(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const tools = await resolveTools(projectRoot, options);
  const workspace = workspaceOption(options) ?? 'bizspec';
  const installedSkills = await installSkills(projectRoot, tools, { force: Boolean(options.force) });
  const workspaceResult = await initializeWorkspace(projectRoot, {
    workspace,
    id: typeof options.id === 'string' ? options.id : undefined,
    title: typeof options.title === 'string' ? options.title : undefined,
  });
  await initializeOrUpdateConfig(projectRoot, { tools, installedSkills, workspace });

  console.log(`BizSpec initialized: ${projectRoot}`);
  console.log(`Workspace: ${workspace}`);
  console.log(`Config: ${workspace}/config.json`);
  console.log(`Skills: ${installedSkills.map((item) => `${item.tool}=${item.path}`).join(', ')}`);
  console.log(workspaceResult.createdManifest
    ? 'Created manifest and missing scaffold files.'
    : 'Existing workspace preserved; only missing scaffold files were created.');
}

async function commandInstall(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const tools = await resolveTools(projectRoot, options);
  const workspace = workspaceOption(options);
  const installedSkills = await installSkills(projectRoot, tools, { force: Boolean(options.force) });
  const current = await readConfig(projectRoot, workspace);
  await initializeOrUpdateConfig(projectRoot, {
    tools,
    installedSkills,
    workspace: workspace ?? current?.workspace ?? 'bizspec',
  });
  console.log(`Installed BizSpec skills: ${installedSkills.map((item) => item.path).join(', ')}`);
}

async function commandUpdate(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const workspace = workspaceOption(options);
  const config = await updateInstalledSkills(projectRoot, {
    force: Boolean(options.force),
    workspace,
  });
  console.log(`Updated BizSpec skills to CLI ${config.cliVersion}:`);
  for (const item of config.installedSkills) console.log(`- ${item.tool}: ${item.path}`);
  console.log(`Installer config: ${config.workspace}/config.json`);
  console.log('Business workspace files were not overwritten.');
}

async function commandUninstall(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const workspace = workspaceOption(options);
  const result = await uninstallSkills(projectRoot, {
    purge: Boolean(options.purge),
    workspace,
  });
  if (result.removed.length === 0) console.log('No managed BizSpec skills found.');
  else for (const path of result.removed) console.log(`Removed: ${path}`);
  console.log(result.workspaceRemoved ? 'BizSpec workspace removed.' : 'BizSpec workspace preserved.');
}

async function workspaceFromConfig(projectRoot: string, options: CliOptions): Promise<string> {
  if (typeof options.workspace === 'string') return options.workspace;
  const config = await readConfig(projectRoot);
  return config?.workspace || 'bizspec';
}

async function commandStatus(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const { project, workflow } = await projectStatus(projectRoot, workspace);
  console.log(`${project.title || '(untitled)'} [${project.status || 'unknown'}]`);
  console.log('');
  console.log('ID     STATUS            TITLE');
  console.log('----------------------------------------------------------------');
  for (const node of workflow) {
    const suffix = node.blockers.length ? ` blockers=${node.blockers.length}` : '';
    console.log(`${node.id.padEnd(6)} ${node.status.padEnd(17)} ${node.title}${suffix}`);
  }
}

async function commandNext(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const node = await nextNode(projectRoot, workspace);
  if (!node) {
    console.log('No actionable node. Resolve blockers or complete dependencies.');
    process.exitCode = 1;
    return;
  }
  console.log(`${node.id} ${node.title} [${node.status}]`);
}

async function commandValidate(args: string[], options: CliOptions): Promise<void> {
  const projectRoot = rootFrom(args[0]);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const errors = await validateProject(projectRoot, workspace);
  if (errors.length === 0) {
    console.log(`Validation passed: ${workspace}`);
    return;
  }
  console.error(`Validation failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

async function commandSetStatus(args: string[], options: CliOptions): Promise<void> {
  let projectPath = '.';
  let nodeId: string | undefined;
  let status: string | undefined;
  if (args[0]?.startsWith('BS-')) {
    [nodeId, status] = args;
  } else {
    [projectPath = '.', nodeId, status] = args;
  }
  if (!nodeId || !status) {
    throw new Error('Usage: bizspec set-status [path] <node-id> <status> --reason <text>');
  }
  const projectRoot = rootFrom(projectPath);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const reason = typeof options.reason === 'string' ? options.reason : undefined;
  const result = await setNodeStatus(projectRoot, workspace, nodeId, status, reason);
  console.log(`${result.nodeId}: ${result.previous} -> ${result.status}`);
}

export async function main(argv: string[]): Promise<void> {
  const { positionals, options } = parseArgs(argv);
  const command = positionals.shift();
  if (!command || command === 'help' || options.help) {
    console.log(usage());
    return;
  }

  switch (command) {
    case 'init': await commandInit(positionals, options); break;
    case 'install': await commandInstall(positionals, options); break;
    case 'update': await commandUpdate(positionals, options); break;
    case 'uninstall': await commandUninstall(positionals, options); break;
    case 'status': await commandStatus(positionals, options); break;
    case 'next': await commandNext(positionals, options); break;
    case 'validate': await commandValidate(positionals, options); break;
    case 'set-status': await commandSetStatus(positionals, options); break;
    case 'version':
    case '--version':
    case '-v': console.log(await version()); break;
    default: throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }
}
