import { auth } from '../auth';
import { getDb } from './db';
import { buildSnapshot, type Snapshot } from './services/snapshot';

/** The signed-in user's full snapshot, or null when signed out (or the account no longer exists). */
export async function loadSnapshot(): Promise<Snapshot | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  try { return await buildSnapshot(await getDb(), id); } catch { return null; }
}
