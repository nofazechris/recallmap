import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { migrate } from 'drizzle-orm/neon-serverless/migrator';
import ws from 'ws';
import { seedReference } from '../src/server/db/seed';
import * as schema from '../src/server/db/schema';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add your Neon connection string to .env.local first.');
  process.exit(1);
}
neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
const pool = new Pool({ connectionString: url });
const db = drizzle({ client: pool, schema });

await migrate(db, { migrationsFolder: 'drizzle' });
await seedReference(db as never);
console.log('Migrations applied and reference data seeded.');
await pool.end();
