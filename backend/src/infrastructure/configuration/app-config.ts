import { z } from 'zod';

const DEFAULT_BEDROCK_REGION = 'ap-south-1';
const DEFAULT_BEDROCK_MODELS = ['zai.glm-5'] as const;

const booleanFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),
  DATABASE_SSL: booleanFlag,
  DATABASE_MAX_CONNECTIONS: z.coerce.number().int().min(1).max(100).default(10),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 90).default(24 * 7),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, 'TOKEN_ENCRYPTION_KEY is required.'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  GOOGLE_REDIRECT_URI: z.url().default('http://localhost:5000/auth/google/callback'),
  AI_PROVIDER: z.enum(['bedrock', 'rule-based']).optional(),
  BEDROCK_API_KEY: z.string().default(''),
  BEDROCK_REGION: z
    .string()
    .regex(/^[a-z]{2}(?:-[a-z]+)+-\d$/, 'BEDROCK_REGION must be an AWS region such as ap-south-1.')
    .default(DEFAULT_BEDROCK_REGION),
  BEDROCK_MODELS: z.string().default(DEFAULT_BEDROCK_MODELS.join(',')),
  FRONTEND_DIST_DIRECTORY: z.string().default(''),
  TRUST_PROXY: booleanFlag,
});

export type AIProviderKind = 'bedrock' | 'rule-based';

export interface AppConfig {
  environment: 'development' | 'test' | 'production';
  port: number;
  frontendOrigin: string;
  database: { url: string; ssl: boolean; maxConnections: number };
  sessionTtlMs: number;
  tokenEncryptionKey: string;
  google: { clientId: string; clientSecret: string; redirectUri: string; configured: boolean };
  ai: { provider: AIProviderKind; bedrockApiKey: string; bedrockRegion: string; bedrockModels: string[] };
  frontendDistDirectory: string | null;
  trustProxy: boolean;
  secureCookies: boolean;
}

export class ConfigurationLoader {
  load(environment: NodeJS.ProcessEnv): AppConfig {
    const parsed = environmentSchema.safeParse(environment);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`Invalid configuration. ${problems}`);
    }
    const values = parsed.data;
    return {
      environment: values.NODE_ENV,
      port: values.PORT,
      frontendOrigin: values.FRONTEND_ORIGIN.replace(/\/$/, ''),
      database: { url: values.DATABASE_URL, ssl: values.DATABASE_SSL, maxConnections: values.DATABASE_MAX_CONNECTIONS },
      sessionTtlMs: values.SESSION_TTL_HOURS * 60 * 60 * 1000,
      tokenEncryptionKey: values.TOKEN_ENCRYPTION_KEY,
      google: {
        clientId: values.GOOGLE_CLIENT_ID,
        clientSecret: values.GOOGLE_CLIENT_SECRET,
        redirectUri: values.GOOGLE_REDIRECT_URI,
        configured: values.GOOGLE_CLIENT_ID.length > 0 && values.GOOGLE_CLIENT_SECRET.length > 0,
      },
      ai: {
        provider: values.AI_PROVIDER ?? (values.BEDROCK_API_KEY.length > 0 ? 'bedrock' : 'rule-based'),
        bedrockApiKey: values.BEDROCK_API_KEY,
        bedrockRegion: values.BEDROCK_REGION,
        bedrockModels: values.BEDROCK_MODELS.split(',')
          .map((model) => model.trim())
          .filter((model) => model.length > 0),
      },
      frontendDistDirectory: values.FRONTEND_DIST_DIRECTORY.length > 0 ? values.FRONTEND_DIST_DIRECTORY : null,
      trustProxy: values.TRUST_PROXY,
      secureCookies: values.NODE_ENV === 'production',
    };
  }
}
