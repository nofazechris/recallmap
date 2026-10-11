import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import { env } from '../config';
import { seedReference } from './seed';
import * as schema from './schema';

export type Db = NeonDatabase<typeof schema>;
/** Either the root database or a transaction handle — services accept both. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

const g = globalThis as unknown as { __rmDb?: Promise<Db>; __rmPool?: Pool };

async function connect(): Promise<Db> {
  const url = env().DATABASE_URL;
  if (url) {
    if (typeof WebSocket === 'undefined' || !neonConfig.webSocketConstructor) {
      const ws = (await import('ws')).default;
      neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
    }
    const pool = (g.__rmPool ??= new Pool({ connectionString: url, max: 10 }));
    return drizzleNeon({ client: pool, schema });
  }

  // No DATABASE_URL: an embedded Postgres (PGlite) for local development and tests only.
  if (env().NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production.');
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
    import('drizzle-orm/pglite/migrator'),
  ]);
  const dir = process.env.PGLITE_DIR ?? '.data/pglite';
  const client = new PGlite(dir === 'memory' ? undefined : dir);
  const local = drizzle({ client, schema });
  await migrate(local, { migrationsFolder: 'drizzle' });
  await seedReference(local as unknown as Db);
  console.warn('[db] DATABASE_URL is not set — using embedded dev database (PGlite). Set DATABASE_URL to use Neon.');
  return local as unknown as Db;
}

export const getDb = (): Promise<Db> => (g.__rmDb ??= connect());
export { schema };
