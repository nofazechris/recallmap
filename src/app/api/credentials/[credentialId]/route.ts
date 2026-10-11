import { and, eq } from 'drizzle-orm';
import { authedRoute } from '@/server/http';
import { credentials } from '@/server/db/schema';
import { notFound } from '@/server/lib/errors';

/** Private view of one of your own credentials (status, transaction, error). */
export const GET = authedRoute<{ credentialId: string }>(async ({ db, userId, params }) => {
  const [c] = await db.select().from(credentials).where(and(eq(credentials.id, params.credentialId), eq(credentials.userId, userId))).limit(1);
  if (!c) throw notFound('Credential not found.');
  return { credential: { id: c.id, type: c.credentialType, status: c.status, error: c.error, txHash: c.transactionHash, chainId: c.chainId, contract: c.contractAddress, issuedAt: c.issuedAt, verifiedAt: c.verifiedAt, payloadHash: c.credentialPayloadHash } };
});
