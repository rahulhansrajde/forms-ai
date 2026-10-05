import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend');
const source = join(backendRoot, 'src', 'infrastructure', 'database', 'migrations');
const target = join(backendRoot, 'dist', 'infrastructure', 'database', 'migrations');

mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, filter: (path) => !path.endsWith('.ts') });
