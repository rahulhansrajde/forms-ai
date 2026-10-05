import type { Database } from './database.js';
import { PGliteDatabase } from './pglite-database.js';
import { PostgresDatabase } from './postgres-database.js';

const EMBEDDED_SCHEME = 'pglite://';
const EMBEDDED_IN_MEMORY = 'memory';

export interface DatabaseSettings {
  url: string;
  maxConnections: number;
  ssl: boolean;
}

export class DatabaseFactory {
  async create(settings: DatabaseSettings): Promise<Database> {
    if (settings.url.startsWith(EMBEDDED_SCHEME)) {
      const location = settings.url.slice(EMBEDDED_SCHEME.length);
      return PGliteDatabase.open(location === EMBEDDED_IN_MEMORY ? null : location);
    }
    return new PostgresDatabase({
      connectionString: settings.url,
      maxConnections: settings.maxConnections,
      ssl: settings.ssl,
    });
  }
}
