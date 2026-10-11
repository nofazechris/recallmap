import { keccak256, toBytes, type Hex } from 'viem';

/**
 * The only thing that is ever hashed and anchored. It names the achievement and (optionally) the topic and
 * holder — never notes, answers, scores, email addresses or anything from a study session.
 * `nonce` is random per credential so the hash can't be guessed by brute-forcing the small set of possible values.
 */
export interface CredentialPayload {
  v: 1;
  type: 'recallmap.achievement';
  credentialId: string;
  achievement: string;
  achievementName: string;
  topic: string | null;
  holder: string | null;
  issuedOn: string;
  nonce: string;
}

const sortKeys = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortKeys(x)]));
  return v;
};

/** Canonical JSON: keys sorted at every level, no whitespace. Anyone can reproduce it from the payload. */
export const canonicalize = (p: CredentialPayload | Record<string, unknown>): string => JSON.stringify(sortKeys(p));

export const hashPayload = (p: CredentialPayload | Record<string, unknown>): Hex => keccak256(toBytes(canonicalize(p)));

/** The on-chain identifier for a credential row (a 32-byte value derived from its UUID). */
export const onchainId = (credentialId: string): Hex => keccak256(toBytes(`recallmap:credential:${credentialId}`));
