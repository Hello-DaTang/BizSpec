import { join, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import {
  NODE_BY_ID,
  NODE_CATALOG,
  NODE_STATUSES,
  SCHEMA_VERSION,
  TERMINAL_NODE_STATUSES,
} from './constants.mjs';
import {
  ensureDir,
  exists,
  nowIso,
  parseFrontMatter,
  readYaml,
  renderFrontMatter,
  writeYaml,
} from './files.mjs';

const COMPLETION_KEYS = [
  'required_sections_present',
  'required_outputs_present',
  'critical_items_have_owner',
  'critical_blockers_resolved',
  'reviewer_confirmed',
];

function nodeMeta(node) {
  return {
    id: node.id,
    title: node.title,
    status: 'not_started',
    owner: null,
    reviewers: [],
    depends_on: [...node.dependsOn],
    inputs: [],
    outputs: [],
    blockers: [],
    completion_check: {
      required_sections_present: true,
      required_outputs_present: false,
      critical_items_have_owner: false,
      critical_blockers_resolved: false,
      reviewer_confirmed: false,
    },
    updated_at: null,
  };
}

function nodeBody(node) {
  return `# ${node.title}\n\n` +
    '## 节点目标\n\n待补充。\n\n' +
    '## 当前结论\n\n暂无。\n\n' +
    '## 已确认内容\n\n暂无。\n\n' +
    '## 待确认内容\n\n暂无。\n\n' +
    '## 推导与候选方案\n\n暂无。\n\n' +
    '## 阻塞项\n\n暂无。\n\n' +
    '## 产物\n\n暂无。\n\n' +
    '## 完成条件检查\n\n' +
    '- [ ] 必填章节完整；\n' +
    '- [ ] 必填产物存在；\n' +
    '- [ ] 关键条目具有业务 Owner；\n' +
    '- [ ] 关键阻塞项已解决；\n' +
    '- [ ] 需要复核的内容已有确认记录。\n\n' +
    '## 状态变更记录\n\n暂无。\n';
}

function renderNode(node) {
  return renderFrontMatter(nodeMeta(node), nodeBody(node));
}

export function workspacePath(projectRoot, workspace = 'bizspec') {
  return resolve(projectRoot, workspace);
}

export async function initializeWorkspace(projectRoot, {
  workspace = 'bizspec',
  id,
  title,
} = {}) {
  const root = workspacePath(projectRoot, workspace);
  const paths = {
    root,
    manifest: join(root, 'manifest.yaml'),
    nodes: join(root, 'nodes'),
    sources: join(root, 'sources'),
    registers: join(root, 'registers'),
    generated: join(root, 'generated'),
  };
  for (const path of Object.values(paths).filter((value) => value !== paths.manifest)) {
    await ensureDir(path);
  }

  let createdManifest = false;
  if (!(await exists(paths.manifest))) {
    const timestamp = nowIso();
    const manifest = {
      schema_version: SCHEMA_VERSION,
      project: {
        id: id || 'bizspec-project',
        title: title || '未命名业务项目',
        status: 'discovery',
        created_at: timestamp,
        updated_at: timestamp,
      },
      sources: [],
      workflow: NODE_CATALOG.map((node) => ({
        id: node.id,
        title: node.title,
        status: 'not_started',
        depends_on: [...node.dependsOn],
        blockers: [],
        owner: null,
        reviewers: [],
        updated_at: null,
        history: [],
      })),
    };
    await writeYaml(paths.manifest, manifest);
    createdManifest = true;
  }

  let createdNodes = 0;
  for (const node of NODE_CATALOG) {
    const path = join(paths.nodes, node.filename);
    if (!(await exists(path))) {
      await writeFile(path, renderNode(node), 'utf8');
      createdNodes += 1;
    }
  }

  const registers = [
    ['rules.yaml', { schema_version: SCHEMA_VERSION, rules: [] }],
    ['questions.yaml', { schema_version: SCHEMA_VERSION, questions: [] }],
    ['decisions.yaml', { schema_version: SCHEMA_VERSION, decisions: [] }],
  ];
  for (const [filename, value] of registers) {
    const path = join(paths.registers, filename);
    if (!(await exists(path))) await writeYaml(path, value);
  }

  return { root, createdManifest, createdNodes };
}

export async function loadManifest(projectRoot, workspace = 'bizspec') {
  const root = workspacePath(projectRoot, workspace);
  const path = join(root, 'manifest.yaml');
  if (!(await exists(path))) throw new Error(`Missing BizSpec manifest: ${path}`);
  return { root, path, manifest: await readYaml(path) };
}

function workflowIndex(manifest) {
  if (!Array.isArray(manifest.workflow)) throw new Error('manifest.workflow must be a list');
  return new Map(manifest.workflow.map((node) => [node.id, node]));
}

export async function projectStatus(projectRoot, workspace = 'bizspec') {
  const { manifest } = await loadManifest(projectRoot, workspace);
  return {
    project: manifest.project ?? {},
    workflow: manifest.workflow ?? [],
  };
}

export async function nextNode(projectRoot, workspace = 'bizspec') {
  const { manifest } = await loadManifest(projectRoot, workspace);
  const index = workflowIndex(manifest);
  const priorities = new Map([
    ['in_progress', 0],
    ['review_required', 1],
    ['not_started', 2],
    ['blocked', 3],
  ]);
  const candidates = (manifest.workflow ?? []).filter((node) => {
    if (TERMINAL_NODE_STATUSES.has(node.status)) return false;
    if ((node.blockers ?? []).length > 0) return false;
    return (node.depends_on ?? []).every((id) => TERMINAL_NODE_STATUSES.has(index.get(id)?.status));
  });
  candidates.sort((a, b) =>
    (priorities.get(a.status) ?? 9) - (priorities.get(b.status) ?? 9) || a.id.localeCompare(b.id),
  );
  return candidates[0] ?? null;
}

function completionErrors(meta) {
  const errors = [];
  const checks = meta.completion_check;
  if (!checks || typeof checks !== 'object') return ['completion_check must be a mapping'];
  for (const key of COMPLETION_KEYS) {
    if (checks[key] !== true) errors.push(`completion_check.${key} must be true`);
  }
  if ((meta.blockers ?? []).length > 0) errors.push('blockers must be empty before status=done');
  return errors;
}

export async function validateProject(projectRoot, workspace = 'bizspec') {
  const { root, manifest } = await loadManifest(projectRoot, workspace);
  const errors = [];
  if (manifest.schema_version !== SCHEMA_VERSION) {
    errors.push(`manifest.schema_version must be ${SCHEMA_VERSION}`);
  }
  if (!manifest.project?.id) errors.push('manifest.project.id is required');
  if (!manifest.project?.title) errors.push('manifest.project.title is required');

  let index;
  try {
    index = workflowIndex(manifest);
  } catch (error) {
    errors.push(error.message);
    index = new Map();
  }

  for (const expected of NODE_CATALOG) {
    const item = index.get(expected.id);
    if (!item) {
      errors.push(`missing workflow node: ${expected.id}`);
      continue;
    }
    if (item.title !== expected.title) errors.push(`${expected.id}.title must be ${expected.title}`);
    if (!NODE_STATUSES.has(item.status)) errors.push(`${expected.id}.status is invalid: ${item.status}`);
    const nodePath = join(root, 'nodes', expected.filename);
    if (!(await exists(nodePath))) {
      errors.push(`missing node file: nodes/${expected.filename}`);
      continue;
    }
    try {
      const { meta } = parseFrontMatter(await readFile(nodePath, 'utf8'));
      if (meta.id !== expected.id) errors.push(`${expected.filename}: id mismatch`);
      if (meta.title !== expected.title) errors.push(`${expected.filename}: title mismatch`);
      if (meta.status !== item.status) errors.push(`${expected.filename}: status differs from manifest`);
      if (item.status === 'done') {
        for (const message of completionErrors(meta)) errors.push(`${expected.id}: ${message}`);
      }
    } catch (error) {
      errors.push(`${expected.filename}: ${error.message}`);
    }
  }
  return errors;
}

export async function setNodeStatus(projectRoot, workspace, nodeId, status, reason) {
  if (!NODE_STATUSES.has(status)) throw new Error(`Invalid node status: ${status}`);
  if (!reason?.trim()) throw new Error('--reason is required for every status change');
  const expected = NODE_BY_ID.get(nodeId);
  if (!expected) throw new Error(`Unknown node: ${nodeId}`);

  const { root, path: manifestPath, manifest } = await loadManifest(projectRoot, workspace);
  const item = (manifest.workflow ?? []).find((node) => node.id === nodeId);
  if (!item) throw new Error(`Node missing from manifest: ${nodeId}`);
  const nodePath = join(root, 'nodes', expected.filename);
  const text = await readFile(nodePath, 'utf8');
  const { meta, body } = parseFrontMatter(text);
  if (status === 'done') {
    const errors = completionErrors(meta);
    if (errors.length > 0) throw new Error(`Cannot mark ${nodeId} done:\n- ${errors.join('\n- ')}`);
  }

  const timestamp = nowIso();
  const previous = item.status;
  item.status = status;
  item.updated_at = timestamp;
  item.history = Array.isArray(item.history) ? item.history : [];
  item.history.push({ at: timestamp, from: previous, to: status, reason });
  manifest.project.updated_at = timestamp;
  meta.status = status;
  meta.updated_at = timestamp;
  await writeYaml(manifestPath, manifest);
  await writeFile(
    nodePath,
    renderFrontMatter(meta, `${body.trimEnd()}\n\n- ${timestamp}: ${previous} → ${status}；${reason}\n`),
    'utf8',
  );
  return { nodeId, previous, status };
}
