import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.js';
import { exists, parseFrontMatter, readJson, readYaml } from '../src/files.js';
import type { InstallerConfig, Manifest, NodeMeta } from '../src/types.js';

async function withTempProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'bizspec-node-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('init installs selected skills and creates 12-node workspace', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex,claude', '--id', 'demo', '--title', '演示项目']);
    assert.equal(await exists(join(root, '.agents/skills/bizspec/SKILL.md')), true);
    assert.equal(await exists(join(root, '.claude/skills/bizspec/SKILL.md')), true);
    const config = await readJson<InstallerConfig>(join(root, 'bizspec/config.json'));
    assert.deepEqual(config.tools, ['codex', 'claude']);
    assert.equal(config.schemaVersion, 2);
    const manifest = await readYaml<Manifest>(join(root, 'bizspec/manifest.yaml'));
    assert.equal(manifest.project.id, 'demo');
    assert.equal(manifest.project.title, '演示项目');
    assert.equal(manifest.workflow.length, 12);
  });
});

test('codex compatibility target installs into .codex/skills', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex-compat']);
    assert.equal(await exists(join(root, '.codex/skills/bizspec/SKILL.md')), true);
    const config = await readJson<InstallerConfig>(join(root, 'bizspec/config.json'));
    assert.deepEqual(config.tools, ['codex-compat']);
  });
});

test('update refreshes skill files and preserves business workspace edits', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex']);
    const nodePath = join(root, 'bizspec/nodes/BS-01-scope.md');
    const before = await readFile(nodePath, 'utf8');
    await writeFile(nodePath, `${before}\nUSER EDIT\n`, 'utf8');
    await writeFile(join(root, '.agents/skills/bizspec/SKILL.md'), 'outdated', 'utf8');
    await main(['update', root]);
    assert.match(await readFile(nodePath, 'utf8'), /USER EDIT/);
    assert.doesNotMatch(await readFile(join(root, '.agents/skills/bizspec/SKILL.md'), 'utf8'), /^outdated$/);
  });
});

test('legacy .bizspec config migrates into the business workspace', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex']);
    const currentConfigPath = join(root, 'bizspec/config.json');
    const configText = await readFile(currentConfigPath, 'utf8');
    await mkdir(join(root, '.bizspec'), { recursive: true });
    await writeFile(join(root, '.bizspec/config.json'), configText, 'utf8');
    await rm(currentConfigPath);

    await main(['update', root]);

    assert.equal(await exists(join(root, '.bizspec')), false);
    assert.equal(await exists(currentConfigPath), true);
    const migrated = await readJson<InstallerConfig>(currentConfigPath);
    assert.equal(migrated.workspace, 'bizspec');
    assert.equal(migrated.schemaVersion, 2);
  });
});

test('validation passes for a fresh workspace', async () => {
  await withTempProject(async (root) => {
    process.exitCode = 0;
    await main(['init', root, '--yes', '--tools', 'codex']);
    const manifest = await readYaml<Manifest>(join(root, 'bizspec/manifest.yaml'));
    assert.equal(manifest.workflow[0]?.title, '项目范围与业务目标');
    const node = parseFrontMatter<NodeMeta>(
      await readFile(join(root, 'bizspec/nodes/BS-01-scope.md'), 'utf8'),
    );
    assert.equal(node.meta.status, 'not_started');
    await main(['validate', root]);
    assert.notEqual(process.exitCode, 1);
  });
});

test('done status is rejected until completion gates pass', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex']);
    await assert.rejects(
      () => main(['set-status', root, 'BS-01', 'done', '--reason', 'premature']),
      /Cannot mark BS-01 done/,
    );
    await main(['set-status', root, 'BS-01', 'in_progress', '--reason', '开始调研']);
    const manifest = await readYaml<Manifest>(join(root, 'bizspec/manifest.yaml'));
    assert.equal(manifest.workflow[0]?.status, 'in_progress');
  });
});

test('uninstall removes managed skills and config but preserves workspace by default', async () => {
  await withTempProject(async (root) => {
    await main(['init', root, '--yes', '--tools', 'codex']);
    await main(['uninstall', root]);
    assert.equal(await exists(join(root, '.agents/skills/bizspec')), false);
    assert.equal(await exists(join(root, 'bizspec/config.json')), false);
    assert.equal(await exists(join(root, 'bizspec/manifest.yaml')), true);
  });
});
