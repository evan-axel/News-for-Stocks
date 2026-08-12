import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The repo root .env is two levels up from apps/worker.
const here = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(here, '../../../.env') });
loadDotenv(); // also honour a worker-local .env if present

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : v.toLowerCase() === 'true'));

const int = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : Number(v)))
    .pipe(z.number().int().positive());

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: int(8080),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_PATH: z.string().default('./data/app.sqlite'),
  PUBLIC_BASE_URL: z.string().default(''),
  DASHBOARD_API_TOKEN: z.string().default(''),

  ANTHROPIC_API_KEY: z.string().default(''),
  ALERT_MODEL: z.string().default('claude-opus-5'),
  CHAT_MODEL: z.string().default('claude-opus-5'),
  /**
   * Effort for the short alert texts. These are high volume and low difficulty,
   * so 'low' keeps them fast and cheap without touching the model choice.
   */
  ALERT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('low'),
  CHAT_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),

  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_WHATSAPP_FROM: z.string().default('whatsapp:+14155238886'),
  ALERT_RECIPIENT: z.string().default(''),
  TWILIO_VALIDATE_SIGNATURE: bool(true),
  TWILIO_ALERT_TEMPLATE_SID: z.string().default(''),

  FMP_API_KEY: z.string().default(''),
  FMP_BASE_URL: z.string().default('https://financialmodelingprep.com'),

  FISCALAI_API_KEY: z.string().default(''),
  FISCALAI_BASE_URL: z.string().default('https://api.fiscal.ai'),
  /** Shorthand for adding Fiscal.ai's MCP server to MCP_SERVERS. */
  FISCALAI_MCP_URL: z.string().default(''),

  /**
   * MCP servers handed to the chat agent, as a JSON array:
   *   [{"name":"fmp-transcripts","url":"https://...","token":"optional"}]
   * Anthropic connects to these server-side and runs their tools, so no adapter
   * code is needed — the agent just gains whatever tools they expose.
   */
  MCP_SERVERS: z.string().default(''),

  /** Priority order for financial data. First provider that answers wins. */
  FINANCIALS_PROVIDERS: z.string().default('fiscalai,fmp,sec-xbrl'),

  SEC_USER_AGENT: z.string().default('News-for-Stocks/0.1 (contact@example.com)'),

  SCAN_INTERVAL_SECONDS: int(300),
  MAX_ITEM_AGE_HOURS: int(24),
  MAX_ALERTS_PER_HOUR: int(12),
  DRY_RUN: bool(false),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = parsed.data;
export type Config = typeof config;

/**
 * Capability flags. The system is designed to degrade rather than crash: with no
 * FMP key you still get alerts backed by free SEC data, with no Anthropic key you
 * still get raw (unwritten) alerts, and with no Twilio creds everything logs to
 * stdout instead of WhatsApp.
 */
export interface McpServerConfig {
  name: string;
  url: string;
  token?: string;
}

/**
 * Parse MCP_SERVERS, folding in the FISCALAI_MCP_URL shorthand.
 *
 * A malformed JSON blob must not take the whole worker down — the agent simply
 * runs without MCP tools, and the error is logged at first use.
 */
export function mcpServers(): McpServerConfig[] {
  const servers: McpServerConfig[] = [];

  if (config.MCP_SERVERS.trim()) {
    try {
      const parsed = JSON.parse(config.MCP_SERVERS) as unknown;
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (!entry || typeof entry !== 'object') continue;
          const e = entry as Record<string, unknown>;
          if (typeof e.name === 'string' && typeof e.url === 'string') {
            servers.push({
              name: e.name,
              url: e.url,
              ...(typeof e.token === 'string' && e.token ? { token: e.token } : {}),
            });
          }
        }
      }
    } catch {
      mcpParseError = 'MCP_SERVERS is not valid JSON — ignoring it.';
    }
  }

  if (config.FISCALAI_MCP_URL && !servers.some((s) => s.name === 'fiscalai')) {
    servers.push({
      name: 'fiscalai',
      url: config.FISCALAI_MCP_URL,
      ...(config.FISCALAI_API_KEY ? { token: config.FISCALAI_API_KEY } : {}),
    });
  }

  return servers;
}

let mcpParseError: string | null = null;
export const getMcpParseError = (): string | null => mcpParseError;

export const capabilities = {
  llm: Boolean(config.ANTHROPIC_API_KEY),
  whatsapp: Boolean(config.TWILIO_ACCOUNT_SID && config.TWILIO_AUTH_TOKEN && config.ALERT_RECIPIENT),
  fmp: Boolean(config.FMP_API_KEY),
  fiscalai: Boolean(config.FISCALAI_API_KEY),
  get mcp(): boolean {
    return mcpServers().length > 0;
  },
} as const;

/** Provider ids in the order the orchestrator should try them. */
export function providerOrder(): string[] {
  return config.FINANCIALS_PROVIDERS.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function describeCapabilities(): string {
  const on = (b: boolean) => (b ? 'on' : 'OFF');
  return [
    `llm=${on(capabilities.llm)}`,
    `whatsapp=${on(capabilities.whatsapp)}`,
    `fiscalai=${on(capabilities.fiscalai)}`,
    `fmp=${on(capabilities.fmp)}`,
    `dryRun=${config.DRY_RUN}`,
  ].join(' ');
}
