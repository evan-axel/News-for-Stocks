import express, { type NextFunction, type Request, type Response } from 'express';
import { capabilities, config, describeCapabilities } from './config.js';
import { Repo } from './db/repo.js';
import { logger } from './logger.js';
import { handleInbound, replyOnWhatsApp } from './pipeline/inbound.js';
import { runScan } from './pipeline/scan.js';
import { verifyTwilioSignature } from './whatsapp/twilio.js';
import { MARKET_CAP_PRESETS } from './matching/filters.js';
import type { FilterKind } from './types.js';

export function createServer(repo: Repo) {
  const app = express();

  app.use(express.urlencoded({ extended: false })); // Twilio posts form-encoded
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ ok: true, capabilities: describeCapabilities(), time: new Date().toISOString() });
  });

  /* ---------------------------------------------------------------------- */
  /* Twilio inbound webhook                                                  */
  /* ---------------------------------------------------------------------- */

  app.post('/webhooks/twilio', async (req: Request, res: Response) => {
    const params = req.body as Record<string, string>;
    const url = `${config.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhooks/twilio`;

    if (!verifyTwilioSignature(req.header('x-twilio-signature'), url, params)) {
      logger.warn({ url }, 'rejected webhook with invalid Twilio signature');
      res.status(403).send('invalid signature');
      return;
    }

    const from = params.From ?? 'unknown';
    const text = params.Body ?? '';
    logger.info({ from, length: text.length }, 'inbound WhatsApp message');

    // Acknowledge immediately with an empty TwiML response. Answering can take
    // many seconds once tools run, and Twilio times the webhook out well before
    // that — so the reply goes out as a separate outbound message.
    res.type('text/xml').send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');

    try {
      const reply = await handleInbound(from, text, repo);
      await replyOnWhatsApp(reply, repo);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'failed to handle inbound message');
      await replyOnWhatsApp('Something went wrong handling that. Try again?', repo).catch(() => {});
    }
  });

  /* ---------------------------------------------------------------------- */
  /* Dashboard API                                                           */
  /* ---------------------------------------------------------------------- */

  const api = express.Router();

  api.use((req: Request, res: Response, next: NextFunction) => {
    if (!config.DASHBOARD_API_TOKEN) return next(); // unset = open, for local dev
    if (req.header('x-api-token') === config.DASHBOARD_API_TOKEN) return next();
    res.status(401).json({ error: 'unauthorized' });
  });

  api.get('/overview', (_req, res) => {
    res.json({
      capabilities,
      paused: repo.kvGet('alerts:paused') === 'true',
      keywords: repo.listKeywords().length,
      filters: repo.listFilters().length,
      watchlist: repo.listWatchlist().length,
      scanIntervalSeconds: config.SCAN_INTERVAL_SECONDS,
      tickerIndexSize: repo.tickerIndexSize(),
    });
  });

  api.get('/alerts', (req, res) => {
    const limit = Number(req.query.limit ?? 50);
    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    res.json(
      repo.listAlerts({
        limit: Number.isFinite(limit) ? limit : 50,
        ...(ticker ? { ticker } : {}),
        ...(status ? { status } : {}),
      }),
    );
  });

  api.get('/keywords', (_req, res) => res.json(repo.listKeywords()));

  api.post('/keywords', (req, res) => {
    const { term, synonyms, negations, matchTerm } = req.body ?? {};
    if (typeof term !== 'string' || !term.trim()) {
      res.status(400).json({ error: 'term is required' });
      return;
    }
    res.json(
      repo.upsertKeyword({
        term,
        synonyms: Array.isArray(synonyms) ? synonyms : [],
        negations: Array.isArray(negations) ? negations : [],
        matchTerm: matchTerm !== false,
      }),
    );
  });

  api.delete('/keywords/:term', (req, res) => {
    const term = req.params.term;
    res.json({ removed: term ? repo.deleteKeyword(term) : false });
  });

  api.get('/filters', (_req, res) =>
    res.json({ filters: repo.listFilters(), marketCapPresets: MARKET_CAP_PRESETS }),
  );

  api.post('/filters', (req, res) => {
    const { kind, value, minValue, maxValue, mode } = req.body ?? {};
    const kinds: FilterKind[] = ['sector', 'industry', 'market_cap', 'exchange', 'country', 'ticker'];
    if (!kinds.includes(kind)) {
      res.status(400).json({ error: `kind must be one of ${kinds.join(', ')}` });
      return;
    }
    res.json(
      repo.addFilter({
        kind,
        value: typeof value === 'string' ? value : null,
        minValue: typeof minValue === 'number' ? minValue : null,
        maxValue: typeof maxValue === 'number' ? maxValue : null,
        mode: mode === 'exclude' ? 'exclude' : 'include',
      }),
    );
  });

  api.delete('/filters/:id', (req, res) => {
    const id = Number(req.params.id);
    res.json({ removed: Number.isFinite(id) ? repo.deleteFilter(id) : false });
  });

  api.get('/sources', (_req, res) => res.json(repo.listSourceHealth()));

  api.get('/watchlist', (_req, res) => res.json(repo.listWatchlist()));

  api.post('/watchlist', (req, res) => {
    const { ticker, name } = req.body ?? {};
    if (typeof ticker !== 'string' || !ticker.trim()) {
      res.status(400).json({ error: 'ticker is required' });
      return;
    }
    repo.addToWatchlist(ticker, typeof name === 'string' ? name : null);
    res.json({ ok: true });
  });

  api.delete('/watchlist/:ticker', (req, res) => {
    const ticker = req.params.ticker;
    res.json({ removed: ticker ? repo.removeFromWatchlist(ticker) : false });
  });

  /** Kick a scan by hand — useful right after changing keywords. */
  api.post('/scan', async (_req, res) => {
    try {
      res.json(await runScan(repo));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.use('/api', api);

  // Express 4 needs the arity-4 signature to recognise this as error middleware.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: err.message }, 'unhandled request error');
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
