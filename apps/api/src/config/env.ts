import { z } from 'zod';

const booleanEnv = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off', ''].includes(normalized)) return false;
  }
  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  DATABASE_URL: z.string().min(1),
  
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  API_PORT: z.coerce.number().default(4000),
  API_URL: z.string().url().optional(),
  
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_IS_PRODUCTION: booleanEnv.default(false),
  
  RESEND_API_KEY: z.string().optional(),
  FONNTE_API_KEY: z.string().optional(),
  
  CLOUDFLARE_R2_ACCESS_KEY: z.string().optional(),
  CLOUDFLARE_R2_SECRET_KEY: z.string().optional(),
  CLOUDFLARE_R2_BUCKET: z.string().optional(),
  CLOUDFLARE_R2_ACCOUNT_ID: z.string().optional(),
  CLOUDFLARE_R2_PUBLIC_URL: z.string().optional(),
  
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().default('1x0000000000000000000000000000000AA'),
  GOOGLE_REDIRECT_URI: z.string().url().default('http://localhost:4000/api/auth/google/callback'),
  NEXT_PUBLIC_WEB_URL: z.string().url().default('http://localhost:3000'),
  
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  ORDER_EXPIRE_MINUTES: z.coerce.number().default(15),
  
  QR_HMAC_SECRET: z.string().min(32),
  QR_ENCRYPTION_KEY: z.string().length(64),
  
  WAITING_ROOM_THRESHOLD: z.coerce.number().default(100),
  WAITING_ROOM_BATCH_SIZE: z.coerce.number().default(50),
  WAITING_ROOM_TICK_MS: z.coerce.number().default(500),
});

export type Env = z.infer<typeof envSchema>;

let config: Env | null = null;

export function loadEnv(): Env {
  if (config) return config;
  
  const result = envSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    result.error.issues.forEach(issue => {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    });
    process.exit(1);
  }
  
  config = result.data;
  
  if (config.NODE_ENV === 'production') {
    console.log('🚀 Running in production mode');
  }
  
  return config;
}

export const env = loadEnv();
