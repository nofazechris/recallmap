import { route } from '@/server/http';
import { verifyPublic } from '@/server/services/credentials';

/** Public. Reads the Arc contract itself — the database's own status is never taken on trust. */
export const GET = route<{ credentialId: string }>(async ({ db, params }) => verifyPublic(db, params.credentialId));
