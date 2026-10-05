import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scannedDirectories = ['shared/src', 'backend/src', 'backend/tests', 'frontend/src', 'frontend/tests', 'frontend/public', 'tests', 'scripts'];
const scannedRootFiles = ['eslint.config.js', 'playwright.config.ts', 'frontend/index.html', 'frontend/vite.config.ts', 'backend/vitest.config.ts'];
const skippedDirectories = new Set(['node_modules', 'dist', 'coverage']);
const scriptExtensions = new Set(['.ts', '.tsx', '.js', '.mjs']);

function listFiles(directory) {
  const absolute = join(root, directory);
  let entries;
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (skippedDirectories.has(entry)) {
      return [];
    }
    const path = join(directory, entry);
    return statSync(join(root, path)).isDirectory() ? listFiles(path) : [path];
  });
}

function scriptComments(path, text) {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Set();
  const record = (ranges) => {
    for (const range of ranges ?? []) {
      found.add(range.pos);
    }
  };
  const visit = (node) => {
    record(ts.getLeadingCommentRanges(text, node.getFullStart()));
    record(ts.getTrailingCommentRanges(text, node.getEnd()));
    for (const child of node.getChildren(source)) {
      visit(child);
    }
  };
  visit(source);
  return [...found].map((position) => source.getLineAndCharacterOfPosition(position).line + 1);
}

function patternComments(text, pattern) {
  const lines = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (pattern.test(line)) {
      lines.push(index + 1);
    }
  });
  return lines;
}

function commentLines(path, text) {
  const extension = extname(path);
  if (scriptExtensions.has(extension)) {
    return scriptComments(path, text);
  }
  if (extension === '.css') {
    return patternComments(text, /\/\*/);
  }
  if (extension === '.html' || extension === '.svg') {
    return patternComments(text, /<!--/);
  }
  if (extension === '.sql') {
    return patternComments(text, /^\s*--|\/\*/);
  }
  return [];
}

const files = [...scannedDirectories.flatMap(listFiles), ...scannedRootFiles];
const violations = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  for (const line of commentLines(file, text)) {
    violations.push(`${relative(root, join(root, file))}:${line}`);
  }
}

if (violations.length > 0) {
  process.stderr.write(`Source comments are not allowed:\n${violations.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`No source comments found in ${files.length} files.\n`);
