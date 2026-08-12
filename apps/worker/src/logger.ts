import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Redact anything that could leak a credential into logs or an error report.
  redact: {
    paths: [
      'apikey',
      'apiKey',
      'authToken',
      'req.headers.authorization',
      'req.headers["x-api-token"]',
      'req.headers["x-twilio-signature"]',
    ],
    censor: '[redacted]',
  },
  transport:
    config.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
      : undefined,
});

export type Logger = typeof logger;
