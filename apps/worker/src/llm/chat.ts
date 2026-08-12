import type Anthropic from '@anthropic-ai/sdk';
import { capabilities, config, getMcpParseError, mcpServers } from '../config.js';
import type { Repo } from '../db/repo.js';
import { logger } from '../logger.js';
import { getAnthropic } from './client.js';
import { CHAT_TOOLS, executeTool } from './tools.js';

const MAX_TURNS = 12;

const CHAT_SYSTEM = `You are the user's friend who follows public markets closely and reads filings, transcripts, and news for them. You are texting them on WhatsApp. You also run their alert system — when a keyword they watch shows up in the news or a filing, you text them about it. Now they are texting you back.

What you can do:
- Pull a full picture of any public company: market cap, historical revenue growth, margins, free cash flow, management, insider buying and selling.
- Fetch and search earnings call transcripts.
- List a company's recent SEC filings.
- Search recent news and press releases.
- Show what alerts you have already sent.
- Change what they're watching: keywords, and company filters like industry, sector, or market-cap band.

How you write:
- Like a text from a smart friend. Short. No headers, no bullet walls, no "Executive Summary". Plain sentences.
- Answer the actual question first, then the context that changes how they'd read it.
- Numbers matter to this person — give the specific figure, not "strong growth".
- Aim for under about 1000 characters unless they asked for depth. If the honest answer is long, lead with the conclusion and offer to go deeper.
- WhatsApp formatting only: *bold*, _italic_. Never markdown headers or tables.

Hard rules:
- Only state numbers that came back from a tool in this conversation. If a tool says data is unavailable, say you couldn't get it. Never estimate a market cap or a growth rate from memory — being wrong about a number here is much worse than saying you don't know.
- Use tools rather than answering from memory for anything current: prices, financials, filings, news, what management said.
- Never predict a price, and never tell them to buy or sell. You surface what's interesting and what the numbers say; the call is theirs.
- When they ask to change what's watched, check the current config first, make the change, then confirm what it now looks like in one line.
- If a question is ambiguous about which company, ask — don't guess between two tickers.`;

export interface ChatResult {
  reply: string;
  toolsUsed: string[];
}

/**
 * Run one user message to completion, including any tool calls.
 *
 * Conversation history is persisted as plain user/assistant text rather than
 * full content blocks: the tool traffic within a turn is scaffolding, and
 * replaying it on every later turn would grow the prompt without helping.
 */
export async function handleChatMessage(
  waId: string,
  userText: string,
  repo: Repo,
): Promise<ChatResult> {
  if (!capabilities.llm) {
    return {
      reply:
        "I can't answer questions right now — no Anthropic API key is configured, so only raw alerts are working.",
      toolsUsed: [],
    };
  }

  const client = getAnthropic();
  const history = repo.recentTurns(waId, 20);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.map((t) => ({ role: t.role, content: t.content })),
    { role: 'user' as const, content: userText },
  ];

  // MCP servers are attached server-side: Anthropic connects to them and runs
  // their tools, so there is nothing to execute on our side. Each one needs BOTH
  // an entry in mcp_servers AND a matching mcp_toolset in tools — declaring only
  // the server is rejected as a validation error.
  const servers = mcpServers();
  const useMcp = servers.length > 0;

  const parseError = getMcpParseError();
  if (parseError) logger.warn({ parseError }, 'MCP config problem');

  const tools: Anthropic.Beta.BetaToolUnion[] = [
    ...(CHAT_TOOLS as unknown as Anthropic.Beta.BetaToolUnion[]),
    ...(servers.map((s) => ({
      type: 'mcp_toolset',
      mcp_server_name: s.name,
    })) as unknown as Anthropic.Beta.BetaToolUnion[]),
  ];

  const toolsUsed: string[] = [];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.beta.messages.create({
      model: config.CHAT_MODEL,
      max_tokens: 16000,
      output_config: { effort: config.CHAT_EFFORT },
      system: CHAT_SYSTEM,
      messages,
      tools,
      ...(useMcp
        ? {
            betas: ['mcp-client-2025-11-20'],
            mcp_servers: servers.map((s) => ({
              type: 'url' as const,
              name: s.name,
              url: s.url,
              ...(s.token ? { authorization_token: s.token } : {}),
            })),
          }
        : {}),
    });

    if (response.stop_reason === 'refusal') {
      logger.warn({ waId }, 'chat response refused');
      return {
        reply: "I can't help with that one. Ask me something else about a company or your alerts.",
        toolsUsed,
      };
    }

    // A server-side tool (MCP) hit the per-turn iteration cap. Re-send with the
    // assistant turn appended and the server picks up where it left off — do NOT
    // add a "continue" user message.
    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content });
      continue;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
    );

    if (toolUses.length === 0) {
      const reply = extractText(response.content);
      repo.appendTurn(waId, 'user', userText);
      repo.appendTurn(waId, 'assistant', reply);
      return { reply, toolsUsed };
    }

    messages.push({ role: 'assistant', content: response.content });

    // Run the requested tools concurrently, then return every result in ONE
    // user message — splitting them teaches the model to stop batching calls.
    const results = await Promise.all(
      toolUses.map(async (use) => {
        toolsUsed.push(use.name);
        const { text, isError } = await executeTool(
          use.name,
          (use.input ?? {}) as Record<string, unknown>,
          repo,
        );
        return {
          type: 'tool_result' as const,
          tool_use_id: use.id,
          content: text,
          ...(isError ? { is_error: true } : {}),
        };
      }),
    );

    messages.push({ role: 'user', content: results });
  }

  logger.warn({ waId, toolsUsed }, 'chat loop hit MAX_TURNS');
  return {
    reply:
      "That turned into more digging than I could finish in one go. Ask me a narrower version and I'll get it.",
    toolsUsed,
  };
}

function extractText(content: readonly Anthropic.Beta.BetaContentBlock[]): string {
  const text = content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  return text || "I didn't get anything back on that — try asking again?";
}
