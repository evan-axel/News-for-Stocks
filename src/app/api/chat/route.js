import { getFiling } from '@/lib/sec/filings';
import { loadFilingText } from '@/lib/sec/document';
import { loadCorpus } from '@/lib/sec/corpus';
import { buildFilingContext, buildHistoryContext } from '@/lib/ai/context';
import { createChatStream } from '@/lib/ai/chat';
import { collectText, describeError } from '@/lib/ai/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function sse(event, data) {
  return new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    cik,
    accession,
    question,
    scope = 'filing',
    history = [],
    forms = [],
    from = '',
    limit = 8,
  } = body || {};

  if (!cik || !String(question || '').trim()) {
    return Response.json({ error: 'cik and question are required' }, { status: 400 });
  }
  if (scope === 'filing' && !accession) {
    return Response.json({ error: 'accession is required when scope is "filing"' }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data) => controller.enqueue(sse(event, data));

      try {
        let built;
        let meta;

        if (scope === 'company') {
          const corpus = await loadCorpus(cik, { forms, from, limit });
          if (!corpus.entries.length) {
            send('error', {
              message: 'No readable filings matched that scope. Widen the form types or date range.',
            });
            controller.close();
            return;
          }
          built = buildHistoryContext(corpus.entries, question);
          meta = {
            scope: 'company',
            filingsSearched: corpus.entries.length,
            filingsConsidered: corpus.considered,
            failures: corpus.failures,
            passages: built.parts.length,
          };
        } else {
          const { filing } = await getFiling(cik, accession);
          if (!filing) {
            send('error', { message: 'Filing not found.' });
            controller.close();
            return;
          }
          const { text } = await loadFilingText(filing);
          built = buildFilingContext(filing, text, question);
          meta = {
            scope: 'filing',
            truncated: built.truncated,
            coverage: built.coverage ?? 1,
            passages: built.parts.length,
          };
        }

        send('meta', meta);

        const { stream: chat, offsets } = createChatStream({
          parts: built.parts,
          history,
          question,
        });

        for await (const event of chat) {
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            send('delta', { text: event.delta.text });
          }
        }

        const message = await chat.finalMessage();

        if (message.stop_reason === 'refusal') {
          send('error', {
            message: `The model declined to answer (${message.stop_details?.category || 'unspecified'}).`,
          });
          controller.close();
          return;
        }

        send('done', {
          runs: collectText(message.content, offsets),
          usage: {
            input: message.usage?.input_tokens ?? 0,
            output: message.usage?.output_tokens ?? 0,
            cacheRead: message.usage?.cache_read_input_tokens ?? 0,
          },
        });
      } catch (error) {
        send('error', { message: describeError(error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
