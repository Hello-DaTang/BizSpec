import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, stringifyYaml } from './yaml-lite.js';

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(start: string): string {
  let current = start;
  while (true) {
    const packageJson = join(current, 'package.json');
    if (existsSync(packageJson)) {
      try {
        const pkg = JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: string };
        if (pkg.name === '@hello-datang/bizspec') return current;
      } catch {
        // Keep walking upward. A parent package.json may belong to another package.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  throw new Error(`Unable to locate @hello-datang/bizspec package root from ${start}`);
}

export const PACKAGE_ROOT = findPackageRoot(SRC_DIR);

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function readYaml<T = unknown>(path: string): Promise<T> {
  return parseYaml(await readFile(path, 'utf8')) as T;
}

export async function writeYaml(path: string, value: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await writeFile(path, stringifyYaml(value), 'utf8');
}

export function parseFrontMatter<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
): { meta: T; body: string } {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?/);
  if (!match) throw new Error('Missing YAML front matter');
  return { meta: parseYaml(match[1] ?? '') as T, body: text.slice(match[0].length) };
}

export function renderFrontMatter(meta: unknown, body: string): string {
  return `---\n${stringifyYaml(meta).trimEnd()}\n---\n\n${body.trimStart()}`;
}

export async function copyTree(source: string, target: string): Promise<string[]> {
  if (!(await exists(source))) return [];
  await ensureDir(target);
  await cp(source, target, { recursive: true, force: true });
  return listFiles(target);
}

export async function listFiles(root: string): Promise<string[]> {
  if (!(await exists(root))) return [];
  const result: string[] = [];

  async function walk(current: string): Promise<void> {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else result.push(relative(root, full).replaceAll('\\', '/'));
    }
  }

  await walk(root);
  return result.sort();
}

export async function removePath(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export function nowIso(): string {
  return new Date().toISOString();
}
