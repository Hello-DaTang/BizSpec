import type { YamlObject, YamlValue } from './types.js';

// A deliberately small YAML subset for BizSpec's own generated files.
// It supports mappings, sequences, quoted/bare scalars, and inline []/{}.
// Keeping this local keeps the published CLI free of runtime dependencies.

interface ParsedLine {
  indent: number;
  content: string;
  number: number;
}

function countIndent(line: string): number {
  return line.match(/^ */)?.[0].length ?? 0;
}

function stripComment(value: string): string {
  let quoted = false;
  let quote = '';
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if ((char === '"' || char === "'") && (i === 0 || value[i - 1] !== '\\')) {
      if (!quoted) {
        quoted = true;
        quote = char;
      } else if (quote === char) {
        quoted = false;
      }
    }
    if (char === '#' && !quoted && (i === 0 || /\s/.test(value[i - 1] ?? ''))) {
      return value.slice(0, i).trimEnd();
    }
  }
  return value;
}

function parseScalar(raw: string): YamlValue {
  const value = stripComment(raw.trim());
  if (value === '') return '';
  if (value === 'null' || value === '~') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return Number(value);
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  ) {
    try {
      return JSON.parse(value) as YamlValue;
    } catch {
      // Fall through to plain text for friendly diagnostics later.
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function splitKeyValue(text: string): [string, string] {
  let quoted = false;
  let quote = '';
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if ((char === '"' || char === "'") && (i === 0 || text[i - 1] !== '\\')) {
      if (!quoted) {
        quoted = true;
        quote = char;
      } else if (quote === char) {
        quoted = false;
      }
    }
    if (char === ':' && !quoted) {
      return [text.slice(0, i).trim(), text.slice(i + 1).trim()];
    }
  }
  throw new Error(`Invalid YAML mapping line: ${text}`);
}

function parseBlock(lines: ParsedLine[], startIndex: number, indent: number): [YamlValue, number] {
  if (startIndex >= lines.length) return [{}, startIndex];
  const first = lines[startIndex];
  if (!first) return [{}, startIndex];
  const isSequence = first.content.startsWith('- ') || first.content === '-';
  const container: YamlValue[] | YamlObject = isSequence ? [] : {};
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    if (!line) break;
    if (line.indent < indent) break;
    if (line.indent > indent) {
      throw new Error(`Unexpected indentation at line ${line.number}`);
    }

    if (isSequence) {
      const sequence = container as YamlValue[];
      if (!(line.content === '-' || line.content.startsWith('- '))) break;
      const itemText = line.content === '-' ? '' : line.content.slice(2).trim();
      if (itemText === '') {
        const next = lines[index + 1];
        if (!next || next.indent <= indent) {
          sequence.push(null);
          index += 1;
          continue;
        }
        const [child, nextIndex] = parseBlock(lines, index + 1, next.indent);
        sequence.push(child);
        index = nextIndex;
        continue;
      }

      if (itemText.includes(':')) {
        const [key, rawValue] = splitKeyValue(itemText);
        const object: YamlObject = {};
        if (rawValue === '') {
          const next = lines[index + 1];
          if (next && next.indent > indent) {
            const [child, nextIndex] = parseBlock(lines, index + 1, next.indent);
            object[key] = child;
            index = nextIndex;
          } else {
            object[key] = {};
            index += 1;
          }
        } else {
          object[key] = parseScalar(rawValue);
          index += 1;
        }

        while (index < lines.length) {
          const extra = lines[index];
          if (!extra || extra.indent !== indent + 2 || extra.content.startsWith('- ')) break;
          const [extraKey, extraRawValue] = splitKeyValue(extra.content);
          if (extraRawValue === '') {
            const next = lines[index + 1];
            if (next && next.indent > indent + 2) {
              const [child, nextIndex] = parseBlock(lines, index + 1, next.indent);
              object[extraKey] = child;
              index = nextIndex;
            } else {
              object[extraKey] = {};
              index += 1;
            }
          } else {
            object[extraKey] = parseScalar(extraRawValue);
            index += 1;
          }
        }
        sequence.push(object);
        continue;
      }

      sequence.push(parseScalar(itemText));
      index += 1;
      continue;
    }

    const object = container as YamlObject;
    if (line.content.startsWith('- ')) break;
    const [key, rawValue] = splitKeyValue(line.content);
    if (rawValue === '') {
      const next = lines[index + 1];
      if (next && next.indent > indent) {
        const [child, nextIndex] = parseBlock(lines, index + 1, next.indent);
        object[key] = child;
        index = nextIndex;
      } else {
        object[key] = {};
        index += 1;
      }
    } else {
      object[key] = parseScalar(rawValue);
      index += 1;
    }
  }

  return [container, index];
}

export function parseYaml(text: string): YamlValue {
  const trimmed = text.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed) as YamlValue;

  const rawLines = text.split(/\r?\n/);
  const lines: ParsedLine[] = [];
  for (let i = 0; i < rawLines.length; i += 1) {
    const raw = (rawLines[i] ?? '').replace(/\t/g, '  ');
    if (!raw.trim() || raw.trimStart().startsWith('#')) continue;
    lines.push({ indent: countIndent(raw), content: raw.trim(), number: i + 1 });
  }
  if (lines.length === 0) return {};
  const [result, index] = parseBlock(lines, 0, lines[0]?.indent ?? 0);
  if (index !== lines.length) {
    throw new Error(`Could not parse YAML near line ${lines[index]?.number ?? 'unknown'}`);
  }
  return result;
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value !== 'string') return JSON.stringify(value);
  if (value === '') return '""';
  if (/^[A-Za-z0-9_./@+-]+$/.test(value) && !['null', 'true', 'false'].includes(value)) return value;
  return JSON.stringify(value);
}

function dumpValue(value: unknown, indent: number): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`;
    return value.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const entries = Object.entries(item as Record<string, unknown>);
        if (entries.length === 0) return `${pad}- {}`;
        const [firstKey, firstValue] = entries[0] ?? ['', null];
        const lines: string[] = [];
        if (firstValue && typeof firstValue === 'object') {
          if (Array.isArray(firstValue) && firstValue.length === 0) {
            lines.push(`${pad}- ${firstKey}: []`);
          } else if (!Array.isArray(firstValue) && Object.keys(firstValue).length === 0) {
            lines.push(`${pad}- ${firstKey}: {}`);
          } else {
            lines.push(`${pad}- ${firstKey}:`);
            lines.push(dumpValue(firstValue, indent + 4));
          }
        } else {
          lines.push(`${pad}- ${firstKey}: ${formatScalar(firstValue)}`);
        }
        for (const [key, child] of entries.slice(1)) {
          if (child && typeof child === 'object') {
            if (Array.isArray(child) && child.length === 0) {
              lines.push(`${pad}  ${key}: []`);
            } else if (!Array.isArray(child) && Object.keys(child).length === 0) {
              lines.push(`${pad}  ${key}: {}`);
            } else {
              lines.push(`${pad}  ${key}:`);
              lines.push(dumpValue(child, indent + 4));
            }
          } else {
            lines.push(`${pad}  ${key}: ${formatScalar(child)}`);
          }
        }
        return lines.join('\n');
      }
      return `${pad}- ${formatScalar(item)}`;
    }).join('\n');
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}`;
    return entries.map(([key, child]) => {
      if (child && typeof child === 'object') {
        if (Array.isArray(child) && child.length === 0) return `${pad}${key}: []`;
        if (!Array.isArray(child) && Object.keys(child).length === 0) return `${pad}${key}: {}`;
        return `${pad}${key}:\n${dumpValue(child, indent + 2)}`;
      }
      return `${pad}${key}: ${formatScalar(child)}`;
    }).join('\n');
  }

  return `${pad}${formatScalar(value)}`;
}

export function stringifyYaml(value: unknown): string {
  return `${dumpValue(value, 0)}\n`;
}
