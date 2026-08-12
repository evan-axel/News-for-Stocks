import { describe, expect, it } from 'vitest';
import { canonicalizeUrl, parseFeed, stripHtml } from './rss.js';

const args = { sourceId: 'test', sourceName: 'Test', sourceKind: 'news' as const };

describe('parseFeed', () => {
  it('parses RSS 2.0', () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>Wire</title>
        <item>
          <title>Acme explores strategic alternatives</title>
          <link>https://example.com/acme</link>
          <description>Acme Corp (NASDAQ: ACME) today announced...</description>
          <pubDate>Tue, 05 Aug 2026 12:00:00 GMT</pubDate>
        </item>
      </channel></rss>`;

    const items = parseFeed({ xml, ...args });
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('Acme explores strategic alternatives');
    expect(items[0]?.url).toBe('https://example.com/acme');
    expect(items[0]?.body).toContain('NASDAQ: ACME');
    expect(items[0]?.publishedAt.getUTCFullYear()).toBe(2026);
  });

  it('parses Atom, preferring rel="alternate" links', () => {
    const xml = `<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <entry>
          <title>8-K - ACME CORP</title>
          <link rel="self" href="https://example.com/self"/>
          <link rel="alternate" href="https://example.com/filing"/>
          <updated>2026-08-05T12:00:00Z</updated>
          <summary>Filing summary</summary>
        </entry>
      </feed>`;

    const items = parseFeed({ xml, ...args });
    expect(items[0]?.url).toBe('https://example.com/filing');
  });

  it('handles a single item as well as a list', () => {
    const xml = `<rss version="2.0"><channel><item><title>One</title><link>https://a.test/1</link></item></channel></rss>`;
    expect(parseFeed({ xml, ...args })).toHaveLength(1);
  });

  it('unwraps Google News redirect links', () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>Story - Publisher</title>
      <link>https://news.google.com/rss/articles/abc?oc=5&amp;url=https%3A%2F%2Freal.example.com%2Fstory</link>
    </item></channel></rss>`;

    const items = parseFeed({ xml, ...args });
    expect(items[0]?.url).toBe('https://real.example.com/story');
  });

  it('strips HTML out of descriptions', () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>T</title><link>https://a.test/2</link>
      <description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;&lt;/p&gt;</description>
    </item></channel></rss>`;
    expect(parseFeed({ xml, ...args })[0]?.body).toBe('Hello world');
  });

  it('returns an empty array for malformed or unknown XML', () => {
    expect(parseFeed({ xml: 'not xml at all <<<', ...args })).toEqual([]);
    expect(parseFeed({ xml: '<html><body>nope</body></html>', ...args })).toEqual([]);
  });

  it('falls back to now for an unparseable date rather than throwing', () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>T</title><link>https://a.test/3</link><pubDate>garbage</pubDate>
    </item></channel></rss>`;
    const items = parseFeed({ xml, ...args });
    expect(items[0]?.publishedAt.getTime()).not.toBeNaN();
  });
});

describe('canonicalizeUrl', () => {
  it('strips tracking parameters', () => {
    expect(canonicalizeUrl('https://a.test/x?utm_source=rss&id=5')).toBe('https://a.test/x?id=5');
  });

  it('drops fragments and trailing slashes so duplicates collapse', () => {
    expect(canonicalizeUrl('https://a.test/x/#top')).toBe('https://a.test/x');
  });

  it('leaves a non-URL string alone', () => {
    expect(canonicalizeUrl('guid-12345')).toBe('guid-12345');
  });
});

describe('stripHtml', () => {
  it('removes scripts and collapses whitespace', () => {
    expect(stripHtml('<script>bad()</script><p>a   b</p>')).toBe('a b');
  });

  it('decodes common entities', () => {
    expect(stripHtml('AT&amp;T &quot;quoted&quot; &#39;x&#39;')).toBe('AT&T "quoted" \'x\'');
  });
});
