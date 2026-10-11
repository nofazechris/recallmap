import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_APP_URL: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().optional(),
  AUTH_SECRET: z.string().optional(),

  // storage — S3-compatible when S3_BUCKET is set, otherwise the local-disk adapter
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  LOCAL_STORAGE_DIR: z.string().default('.data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().default(15),

  // AI
  AI_PROVIDER: z.enum(['anthropic', 'openai', 'openai-compatible']).optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_BASE_URL: z.string().optional(),
  AI_TIMEOUT_MS: z.coerce.number().default(90_000),

  // Arc
  ARC_CHAIN_ID: z.coerce.number().optional(),
  ARC_RPC_URL: z.string().optional(),
  ARC_EXPLORER_URL: z.string().optional(),
  ARC_CREDENTIAL_CONTRACT_ADDRESS: z.string().optional(),
  ARC_ISSUER_PRIVATE_KEY: z.string().optional(),
  ARC_MAX_ISSUANCES_PER_DAY: z.coerce.number().int().min(1).default(100),

  // jobs
  CRON_SECRET: z.string().optional(),
  RECALLMAP_ALLOW_DEV_ADAPTERS: bool.default(false),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
/** Parsed lazily so importing a module never throws during `next build`. */
export const env = (): Env => (cached ??= schema.parse(process.env));

export const isProd = () => env().NODE_ENV === 'production';
