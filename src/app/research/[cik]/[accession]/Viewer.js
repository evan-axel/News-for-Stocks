'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';

const TABS = [
  { id: 'summary', label: 'Summary', icon: Sparkles },
  { id: 'chat', label: 'Ask', icon: MessageSquare },
];

/** Parses an SSE byte stream into {event, data} objects. */
async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let split;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);

      let event = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event: ')) event = line.slice(7).trim();
        else if (line.startsWith('data: ')) dataLines.push(line.slice(6));
      }
      if (dataLines.length) {
        try {
          yield { event, data: JSON.parse(dataLines.join('\n')) };
        } catch {
          // A frame we cannot parse is not worth killing the stream over.
        }
      }
    }
  }
}

/** Renders text runs with a numbered, clickable chip per citation. */
function Runs({ runs, onCite, currentAccession }) {
  let counter = 0;

  return (
    <div className="space-y-1 text-sm leading-relaxed text-slate-800">
      {runs.map((run, i) => (
        <span key={i} className="whitespace-pre-wrap">
          {run.text}
          {run.citations.map((citation, j) => {
            counter += 1;
            const n = counter;
            const sameDoc = !citation.accession || citation.accession === currentAccession;
            return (
              <button
                key={j}
                type="button"
                title={citation.text?.slice(0, 300)}
                onClick={() => onCite(citation)}
                className={`mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded px-1 align-super text-[10px] font-semibold transition-colors ${
                  sameDoc
                    ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
              >
                {n}
              </button>
            );
          })}
        </span>
      ))}
    </div>
  );
}

function markdownish(text) {
  // The model is asked for "## Heading" sections; everything else is prose.
  return text.split('\n').map((line, i) => {
    if (line.startsWith('## ')) {
      return (
        <h3 key={i} className="mt-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {line.slice(3)}
        </h3>
      );
    }
    return <span key={i}>{line}{'\n'}</span>;
  });
}

export default function Viewer({ cik, accession }) {
  const [doc, setDoc] = useState(null);
  const [docError, setDocError] = useState(null);
  const [tab, setTab] = useState('summary');
  const [active, setActive] = useState(null);

  const docRef = useRef(null);
  const markRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setDocError(null);

    fetch(`/api/document?cik=${encodeURIComponent(cik)}&accession=${encodeURIComponent(accession)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load the filing');
        return data;
      })
      .then((data) => !cancelled && setDoc(data))
      .catch((err) => !cancelled && setDocError(err.message));

    return () => {
      cancelled = true;
    };
  }, [cik, accession]);

  const onCite = useCallback((citation) => {
    if (citation.start == null) return;
    setActive(citation);
  }, []);

  useEffect(() => {
    if (active && markRef.current) {
      markRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [active]);

  const body = useMemo(() => {
    if (!doc) return null;
    const { text } = doc;
    if (!active || active.start == null || active.start >= text.length) {
      return <>{text}</>;
    }
    const start = Math.max(0, active.start);
    const end = Math.min(text.length, Math.max(active.end ?? start, start));
    return (
      <>
        {text.slice(0, start)}
        <mark ref={markRef} className="rounded bg-amber-200 px-0.5 text-slate-900">
          {text.slice(start, end)}
        </mark>
        {text.slice(end)}
      </>
    );
  }, [doc, active]);

  return (
    <div className="space-y-4">
      <Link
        href="/research"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={14} />
        Back to search
      </Link>

      {docError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {docError}
        </div>
      )}

      {doc && (
        <header className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill bg-indigo-50 font-mono text-indigo-700">{doc.filing.form}</span>
                <span className="font-semibold text-slate-900">{doc.filing.companyName}</span>
                {doc.filing.ticker && (
                  <span className="font-mono text-sm text-slate-500">{doc.filing.ticker}</span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                Filed {doc.filing.filingDate}
                {doc.filing.reportDate && ` · period ${doc.filing.reportDate}`}
                {` · ${Math.round(doc.chars / 1000).toLocaleString()}k characters`}
              </div>
              {doc.filing.itemLabels?.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {doc.filing.itemLabels.map((item) => (
                    <li key={item} className="pill bg-amber-50 text-amber-800">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <a
              href={doc.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary shrink-0"
            >
              <ExternalLink size={14} />
              On EDGAR
            </a>
          </div>
        </header>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <div className="flex shrink-0 gap-1 border-b border-slate-200 p-2">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`btn flex-1 ${
                    tab === item.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={15} />
                  {item.label}
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            {tab === 'summary' ? (
              <SummaryPane
                cik={cik}
                accession={accession}
                ready={Boolean(doc)}
                onCite={onCite}
                currentAccession={doc?.filing?.accession}
              />
            ) : (
              <ChatPane
                cik={cik}
                accession={accession}
                ready={Boolean(doc)}
                onCite={onCite}
                currentAccession={doc?.filing?.accession}
              />
            )}
          </div>
        </div>

        <div className="card flex h-[calc(100vh-14rem)] flex-col overflow-hidden">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Filing text</h2>
            {active && (
              <button
                type="button"
                className="text-xs text-slate-500 underline hover:text-slate-800"
                onClick={() => setActive(null)}
              >
                Clear highlight
              </button>
            )}
          </div>
          <div ref={docRef} className="min-h-0 flex-1 overflow-auto p-4">
            {doc ? (
              <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-800">
                {body}
              </pre>
            ) : (
              !docError && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching the document from EDGAR…
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryPane({ cik, accession, ready, onCite, currentAccession }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    fetch(`/api/summary?accession=${encodeURIComponent(accession)}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary || null);
        setAvailable(data.available !== false);
      })
      .catch(() => {});
  }, [accession]);

  const generate = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cik, accession, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not generate a summary');
      setSummary(data.summary);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!available && !summary) {
    return (
      <div className="p-6 text-sm text-slate-600">
        Set <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code> in{' '}
        <code className="rounded bg-slate-100 px-1">.env</code> to generate summaries. Search and the
        filing text work without it.
      </div>
    );
  }

  return (
    <div className="p-4">
      {!summary && !loading && (
        <div className="py-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mx-auto mt-3 max-w-sm text-sm text-slate-600">
            Generate an analyst read of this filing. Every claim links back to the span of text it
            came from.
          </p>
          <button type="button" className="btn-primary mx-auto mt-4" disabled={!ready} onClick={() => generate(false)}>
            Summarize filing
          </button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading the filing…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {summary && !loading && (
        <div>
          {summary.truncated && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                This filing is too long to read in one pass. The summary covers the most relevant
                passages ({Math.round((summary.coverage || 0) * 100)}% of the text). Use Ask for
                anything specific.
              </span>
            </div>
          )}

          <div className="prose-sm">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
              {summary.runs.map((run, i) => (
                <span key={i}>
                  {markdownish(run.text)}
                  {run.citations.map((citation, j) => (
                    <button
                      key={j}
                      type="button"
                      title={citation.text?.slice(0, 300)}
                      onClick={() => onCite(citation)}
                      className="mx-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded bg-indigo-100 px-1 align-super text-[10px] font-semibold text-indigo-700 transition-colors hover:bg-indigo-200"
                    >
                      ¶
                    </button>
                  ))}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-400">
            <span>
              {summary.cached ? 'Cached' : 'Generated'} · {summary.model}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 underline hover:text-slate-700"
              onClick={() => generate(true)}
            >
              <RefreshCw size={11} />
              Regenerate
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const SCOPES = [
  { id: 'filing', label: 'This filing' },
  { id: 'company', label: 'Company history' },
];

function ChatPane({ cik, accession, ready, onCite, currentAccession }) {
  const [scope, setScope] = useState('filing');
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, streaming]);

  const ask = async () => {
    const text = question.trim();
    if (!text || streaming) return;

    setQuestion('');
    setError(null);
    setMeta(null);
    setStreaming(true);

    const history = turns.flatMap((turn) => [
      { role: 'user', content: turn.question },
      { role: 'assistant', content: turn.text },
    ]);

    setTurns((prev) => [...prev, { question: text, text: '', runs: null, scope }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cik, accession, question: text, scope, history }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      for await (const { event, data } of readSSE(res)) {
        if (event === 'meta') setMeta(data);
        else if (event === 'delta') {
          setTurns((prev) => {
            const next = [...prev];
            next[next.length - 1] = {
              ...next[next.length - 1],
              text: next[next.length - 1].text + data.text,
            };
            return next;
          });
        } else if (event === 'done') {
          setTurns((prev) => {
            const next = [...prev];
            next[next.length - 1] = { ...next[next.length - 1], runs: data.runs };
            return next;
          });
        } else if (event === 'error') {
          setError(data.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-slate-100 p-3">
        <div className="flex gap-1">
          {SCOPES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setScope(item.id)}
              className={`pill border ${
                scope === item.id
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="hint">
          {scope === 'filing'
            ? 'Answers come from this document only.'
            : 'Searches the most recent filings for this company and cites which one each fact came from.'}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {turns.length === 0 && (
          <div className="py-6 text-center text-sm text-slate-500">
            <MessageSquare className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mx-auto mt-3 max-w-xs">
              Ask something specific. &ldquo;What changed in the risk factors?&rdquo;, &ldquo;What
              are the terms of the credit facility?&rdquo;, &ldquo;Who left and why?&rdquo;
            </p>
          </div>
        )}

        <div className="space-y-5">
          {turns.map((turn, i) => (
            <div key={i}>
              <p className="text-sm font-medium text-slate-900">{turn.question}</p>
              <div className="mt-2">
                {turn.runs ? (
                  <Runs runs={turn.runs} onCite={onCite} currentAccession={currentAccession} />
                ) : (
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {turn.text}
                    {streaming && i === turns.length - 1 && (
                      <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-slate-400 align-middle" />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {meta?.scope === 'company' && (
          <p className="mt-4 text-xs text-slate-400">
            Searched {meta.filingsSearched} filing{meta.filingsSearched === 1 ? '' : 's'} ·{' '}
            {meta.passages} passages used
          </p>
        )}
        {meta?.scope === 'filing' && meta.truncated && (
          <p className="mt-4 text-xs text-amber-700">
            Long filing — answered from the {meta.passages} most relevant passages.
          </p>
        )}

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex gap-2">
          <textarea
            className="input resize-none"
            rows={2}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask about this filing…"
            disabled={!ready}
          />
          <button
            type="button"
            className="btn-primary shrink-0 self-end"
            onClick={ask}
            disabled={!ready || streaming || !question.trim()}
          >
            {streaming ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
