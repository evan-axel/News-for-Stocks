import Anthropic from '@anthropic-ai/sdk';
import { capabilities, config } from '../config.js';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!capabilities.llm) {
    throw new Error('ANTHROPIC_API_KEY is not set — LLM features are disabled.');
  }
  client ??= new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  return client;
}

/** Concatenate the text blocks of a response, ignoring thinking and tool blocks. */
export function textOf(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim();
}
