// backend/src/config/environment.ts

import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  CIRCLE_API_KEY: z.string().min(1),
  CIRCLE_ENTITY_SECRET: z.string().min(1),
  CIRCLE_USDC_TOKEN_ID: z.string().uuid().default('3c90c3cc-0d44-4b50-8888-8dd25736052a'), // ✅ Arc Testnet USDC
  ARC_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  USDC_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  X402_FACILITATOR_URL: z.string().url().default('https://facilitator.x402.org'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  REDIS_URL: z.string().url().optional(),
  ARC_CHAIN_ID: z.coerce.number().default(5042002),
});

export type EnvConfig = z.infer<typeof envSchema>;

let validatedEnv: EnvConfig;

export function getEnv(): EnvConfig {
  if (!validatedEnv) {
    try {
      validatedEnv = envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('❌ Invalid environment variables:');
        error.errors.forEach((err) => console.error(`  - ${err.path.join('.')}: ${err.message}`));
        process.exit(1);
      }
      throw error;
    }
  }
  return validatedEnv;
}