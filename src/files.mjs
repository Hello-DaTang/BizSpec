import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, stringifyYaml } from './yaml-lite.mjs';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = resolve(SRC_DIR, '..');

export async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function ensureDir(path) {
  await mkdir(path, { recursive: true });
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function writeJson(path, value) {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readYaml(path) {
  return parseYaml(await readFile(path, 'utf8'));
}

export async function writeYaml(path, value) {
  await ensureDir(dirname(path));
  await writeFile(path, stringifyYaml(value), 'utf8');
}

export function parseFrontMatter(text) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) throw new Error('Missing YAML front matter');
  return { meta: parseYaml(match[1]), body: text.slice(match[0].length) };
}

export function renderFrontMatter(meta, body) {
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${body.trimStart()}`;
}

export async function copyTree(source, target) {
  if (!(await exists(source))) return [];
  await ensureDir(target);
  await cp(source, target, { recursive: true, force: true });
  return listFiles(target);
}

export async function listFiles(root) {
  if (!(await exists(root))) return [];
  const result = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else result.push(relative(root, full).replaceAll('\\', '/'));
    }
  }
  await walk(root);
  return result.sort();
}

export async function removePath(path) {
  await rm(path, { recursive: true, force: true });
}

export function nowIso() {
  return new Date().toISOString();
}
