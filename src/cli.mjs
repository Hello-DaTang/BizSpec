import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { PACKAGE_ROOT } from './files.mjs';
import {
  defaultTools,
  detectTools,
  initializeOrUpdateConfig,
  installSkills,
  normalizeTools,
  readConfig,
  uninstallSkills,
  updateInstalledSkills,
} from './skills.mjs';
import {
  initializeWorkspace,
  nextNode,
  projectStatus,
  setNodeStatus,
  validateProject,
} from './project.mjs';

function usage() {
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

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
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

async function version() {
  return JSON.parse(await readFile(resolve(PACKAGE_ROOT, 'package.json'), 'utf8')).version;
}

async function resolveTools(projectRoot, options) {
  if (options.tools) return normalizeTools([options.tools]);
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

function rootFrom(value) {
  return resolve(value || '.');
}

async function commandInit(args, options) {
  const projectRoot = rootFrom(args[0]);
  const tools = await resolveTools(projectRoot, options);
  const workspace = String(options.workspace || 'bizspec');
  const installedSkills = await installSkills(projectRoot, tools, { force: Boolean(options.force) });
  const workspaceResult = await initializeWorkspace(projectRoot, {
    workspace,
    id: options.id,
    title: options.title,
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

async function commandInstall(args, options) {
  const projectRoot = rootFrom(args[0]);
  const tools = await resolveTools(projectRoot, options);
  const workspace = options.workspace ? String(options.workspace) : null;
  const installedSkills = await installSkills(projectRoot, tools, { force: Boolean(options.force) });
  const current = await readConfig(projectRoot, workspace);
  await initializeOrUpdateConfig(projectRoot, {
    tools,
    installedSkills,
    workspace: workspace ?? current?.workspace ?? 'bizspec',
  });
  console.log(`Installed BizSpec skills: ${installedSkills.map((item) => item.path).join(', ')}`);
}

async function commandUpdate(args, options) {
  const projectRoot = rootFrom(args[0]);
  const workspace = options.workspace ? String(options.workspace) : null;
  const config = await updateInstalledSkills(projectRoot, {
    force: Boolean(options.force),
    workspace,
  });
  console.log(`Updated BizSpec skills to CLI ${config.cliVersion}:`);
  for (const item of config.installedSkills) console.log(`- ${item.tool}: ${item.path}`);
  console.log(`Installer config: ${config.workspace}/config.json`);
  console.log('Business workspace files were not overwritten.');
}

async function commandUninstall(args, options) {
  const projectRoot = rootFrom(args[0]);
  const workspace = options.workspace ? String(options.workspace) : null;
  const result = await uninstallSkills(projectRoot, {
    purge: Boolean(options.purge),
    workspace,
  });
  if (result.removed.length === 0) console.log('No managed BizSpec skills found.');
  else for (const path of result.removed) console.log(`Removed: ${path}`);
  console.log(result.workspaceRemoved ? 'BizSpec workspace removed.' : 'BizSpec workspace preserved.');
}

async function workspaceFromConfig(projectRoot, options) {
  if (options.workspace) return String(options.workspace);
  const config = await readConfig(projectRoot);
  return config?.workspace || 'bizspec';
}

async function commandStatus(args, options) {
  const projectRoot = rootFrom(args[0]);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const { project, workflow } = await projectStatus(projectRoot, workspace);
  console.log(`${project.title || '(untitled)'} [${project.status || 'unknown'}]`);
  console.log('');
  console.log('ID     STATUS            TITLE');
  console.log('----------------------------------------------------------------');
  for (const node of workflow) {
    const suffix = (node.blockers ?? []).length ? ` blockers=${node.blockers.length}` : '';
    console.log(`${String(node.id).padEnd(6)} ${String(node.status).padEnd(17)} ${node.title}${suffix}`);
  }
}

async function commandNext(args, options) {
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

async function commandValidate(args, options) {
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

async function commandSetStatus(args, options) {
  let projectPath = '.';
  let nodeId;
  let status;
  if (args[0]?.startsWith('BS-')) {
    [nodeId, status] = args;
  } else {
    [projectPath, nodeId, status] = args;
  }
  if (!nodeId || !status) throw new Error('Usage: bizspec set-status [path] <node-id> <status> --reason <text>');
  const projectRoot = rootFrom(projectPath);
  const workspace = await workspaceFromConfig(projectRoot, options);
  const result = await setNodeStatus(projectRoot, workspace, nodeId, status, options.reason);
  console.log(`${result.nodeId}: ${result.previous} -> ${result.status}`);
}

export async function main(argv) {
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
