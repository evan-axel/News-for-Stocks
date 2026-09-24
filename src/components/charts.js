'use client';

import { useId, useMemo, useRef, useState } from 'react';

/**
 * Inline-SVG charts, written against the `--series-*` / `--text-*` roles defined
 * on `.viz` in globals.css so light and dark swap in one place.
 *
 * Conventions applied throughout, from the visualization guidance:
 * 2px lines; a 2px surface gap between adjacent bars; 4px rounded data-ends
 * anchored to the baseline; recessive grid and axes; a hover layer on every
 * plotted form; a single series carries no legend because the title names it;
 * and numbers wear text tokens, never the series color.
 */

function niceTicks(min, max, count = 4) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || mag * 10;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step / 1000; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function Tooltip({ x, y, width, children }) {
  // Flip to the left of the cursor near the right edge so it never clips.
  const flip = x > width * 0.6;
  return (
    <foreignObject
      x={flip ? x - 190 : x + 10}
      y={Math.max(2, y - 18)}
      width={186}
      height={96}
      style={{ pointerEvents: 'none', overflow: 'visible' }}
    >
      <div className="rounded-md border border-slate-200 bg-white/95 px-2 py-1.5 text-[11px] leading-snug shadow-sm backdrop-blur">
        {children}
      </div>
    </foreignObject>
  );
}

/**
 * Compact trend line for table cells. No axes, no hover — it is a shape, and
 * the exact figure lives in the column beside it.
 */
export function Sparkline({ values, width = 84, height = 24, tone = 'var(--series-1)' }) {
  const clean = (values || []).filter((v) => v != null && Number.isFinite(v));
  if (clean.length < 2) return <span className="text-xs text-slate-300">—</span>;

  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const span = max - min || 1;
  const step = width / (clean.length - 1);

  const points = clean
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ');

  const last = clean[clean.length - 1];
  const lastY = height - ((last - min) / span) * height;

  return (
    <svg width={width} height={height} className="viz block overflow-visible" aria-hidden="true">
      <polyline points={points} fill="none" stroke={tone} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={width} cy={lastY} r="2.5" fill={tone} stroke="var(--surface-1)" strokeWidth="2" />
    </svg>
  );
}

/**
 * Line chart with a crosshair and tooltip, plus optional reference bands for a
 * median and a min/max range — the "relative to its own history" read.
 */
export function LineChart({
  points,
  xKey = 'date',
  yKey = 'value',
  height = 220,
  format = (v) => v?.toFixed(1),
  formatX = (v) => v,
  band = null,
  label = '',
}) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const clipId = useId();

  const data = useMemo(
    () => (points || []).filter((p) => p && p[yKey] != null && Number.isFinite(p[yKey])),
    [points, yKey]
  );

  if (data.length < 2) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-slate-400">
        Not enough history to plot.
      </div>
    );
  }

  const pad = { top: 10, right: 12, bottom: 22, left: 44 };
  const width = 640;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = data.map((d) => d[yKey]);
  let min = Math.min(...values, band?.min ?? Infinity);
  let max = Math.max(...values, band?.max ?? -Infinity);
  const margin = (max - min) * 0.08 || Math.abs(max) * 0.1 || 1;
  min -= margin;
  max += margin;

  const xAt = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const yAt = (v) => pad.top + plotH - ((v - min) / (max - min || 1)) * plotH;

  const path = data.map((d, i) => `${i ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(d[yKey]).toFixed(1)}`).join(' ');
  const ticks = niceTicks(min, max, 4);

  const onMove = (event) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((event.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((px - pad.left) / plotW) * (data.length - 1));
    if (i >= 0 && i < data.length) setHover(i);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="viz w-full"
      role="img"
      aria-label={label}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={pad.left} y={pad.top} width={plotW} height={plotH} />
        </clipPath>
      </defs>

      {band?.min != null && band?.max != null && (
        <rect
          x={pad.left}
          y={yAt(band.max)}
          width={plotW}
          height={Math.max(0, yAt(band.min) - yAt(band.max))}
          fill="var(--series-1)"
          opacity="0.06"
        />
      )}

      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="var(--gridline)" strokeWidth="1" />
          <text x={pad.left - 8} y={yAt(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(tick)}
          </text>
        </g>
      ))}

      {band?.median != null && (
        <g>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={yAt(band.median)}
            y2={yAt(band.median)}
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <text x={width - pad.right} y={yAt(band.median) - 5} textAnchor="end" fontSize="10" fill="var(--text-secondary)">
            median {format(band.median)}
          </text>
        </g>
      )}

      <path d={path} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${clipId})`} />

      <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} stroke="var(--baseline)" strokeWidth="1" />

      {[0, Math.floor(data.length / 2), data.length - 1].map((i) => (
        <text key={i} x={xAt(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontSize="10" fill="var(--text-muted)">
          {formatX(data[i][xKey])}
        </text>
      ))}

      {hover != null && (
        <g>
          <line x1={xAt(hover)} x2={xAt(hover)} y1={pad.top} y2={pad.top + plotH} stroke="var(--text-muted)" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx={xAt(hover)} cy={yAt(data[hover][yKey])} r="4.5" fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth="2" />
          <Tooltip x={xAt(hover)} y={yAt(data[hover][yKey])} width={width}>
            <div className="font-medium text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {format(data[hover][yKey])}
            </div>
            <div className="text-slate-500">{formatX(data[hover][xKey])}</div>
          </Tooltip>
        </g>
      )}
    </svg>
  );
}

/**
 * Signed bars around a zero baseline. Sign is carried by direction as well as
 * hue, so the diverging pair is never the only cue.
 */
export function DivergingBars({ rows, height = 200, format = (v) => `${(v * 100).toFixed(1)}%`, label = '' }) {
  const [hover, setHover] = useState(null);

  const data = (rows || []).filter((r) => r.value != null && Number.isFinite(r.value));
  if (!data.length) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">No data to plot.</div>;
  }

  const pad = { top: 14, right: 10, bottom: 30, left: 44 };
  const width = 640;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const extent = Math.max(...data.map((r) => Math.abs(r.value))) * 1.15 || 1;
  const yAt = (v) => pad.top + plotH / 2 - (v / extent) * (plotH / 2);
  const slot = plotW / data.length;
  const barW = Math.max(6, Math.min(34, slot - 2)); // 2px surface gap between bars

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="viz w-full" role="img" aria-label={label}>
      {[extent / 2, -extent / 2].map((tick) => (
        <g key={tick}>
          <line x1={pad.left} x2={width - pad.right} y1={yAt(tick)} y2={yAt(tick)} stroke="var(--gridline)" strokeWidth="1" />
          <text x={pad.left - 8} y={yAt(tick) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(tick)}
          </text>
        </g>
      ))}

      {data.map((row, i) => {
        const cx = pad.left + slot * i + slot / 2;
        const zero = yAt(0);
        const y = yAt(row.value);
        const barH = Math.max(1, Math.abs(zero - y));
        const positive = row.value >= 0;
        return (
          <g key={row.key || i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            {/* Hit target larger than the mark. */}
            <rect x={cx - slot / 2} y={pad.top} width={slot} height={plotH} fill="transparent" />
            <rect
              x={cx - barW / 2}
              y={positive ? y : zero}
              width={barW}
              height={barH}
              rx="4"
              fill={positive ? 'var(--pos)' : 'var(--neg)'}
              opacity={hover == null || hover === i ? 1 : 0.55}
            />
          </g>
        );
      })}

      <line x1={pad.left} x2={width - pad.right} y1={yAt(0)} y2={yAt(0)} stroke="var(--baseline)" strokeWidth="1" />

      {data.map((row, i) => {
        if (data.length > 10 && i % 2) return null;
        const cx = pad.left + slot * i + slot / 2;
        return (
          <text key={`l${i}`} x={cx} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
            {row.label}
          </text>
        );
      })}

      {hover != null && (
        <Tooltip x={pad.left + slot * hover + slot / 2} y={yAt(data[hover].value)} width={width}>
          <div className="font-medium text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(data[hover].value)}
          </div>
          <div className="text-slate-500">{data[hover].tooltip || data[hover].label}</div>
        </Tooltip>
      )}
    </svg>
  );
}

/** Magnitude over ordered periods. One series, so no legend — the title names it. */
export function Columns({ rows, height = 200, format = (v) => String(v), label = '' }) {
  const [hover, setHover] = useState(null);

  const data = (rows || []).filter((r) => r.value != null && Number.isFinite(r.value));
  if (!data.length) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">No data to plot.</div>;
  }

  const pad = { top: 22, right: 10, bottom: 26, left: 10 };
  const width = 640;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const max = Math.max(...data.map((r) => r.value), 0);
  const min = Math.min(...data.map((r) => r.value), 0);
  const span = max - min || 1;
  const yAt = (v) => pad.top + plotH - ((v - min) / span) * plotH;

  const slot = plotW / data.length;
  const barW = Math.max(8, Math.min(48, slot - 2));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="viz w-full" role="img" aria-label={label}>
      {data.map((row, i) => {
        const cx = pad.left + slot * i + slot / 2;
        const y = yAt(row.value);
        const zero = yAt(Math.max(0, min));
        return (
          <g key={row.key || i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <rect x={cx - slot / 2} y={pad.top} width={slot} height={plotH} fill="transparent" />
            <rect
              x={cx - barW / 2}
              y={y}
              width={barW}
              height={Math.max(1, zero - y)}
              rx="4"
              fill="var(--series-1)"
              opacity={hover == null || hover === i ? 1 : 0.55}
            />
            {/* Direct labels on the ends, not a number on every gridline. */}
            {(data.length <= 8 || i === data.length - 1) && (
              <text x={cx} y={y - 6} textAnchor="middle" fontSize="10" fill="var(--text-secondary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {format(row.value)}
              </text>
            )}
          </g>
        );
      })}

      <line x1={pad.left} x2={width - pad.right} y1={yAt(Math.max(0, min))} y2={yAt(Math.max(0, min))} stroke="var(--baseline)" strokeWidth="1" />

      {data.map((row, i) => (
        <text key={`x${i}`} x={pad.left + slot * i + slot / 2} y={height - 8} textAnchor="middle" fontSize="9" fill="var(--text-muted)">
          {row.label}
        </text>
      ))}

      {hover != null && (
        <Tooltip x={pad.left + slot * hover + slot / 2} y={yAt(data[hover].value)} width={width}>
          <div className="font-medium text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {format(data[hover].value)}
          </div>
          <div className="text-slate-500">{data[hover].tooltip || data[hover].label}</div>
        </Tooltip>
      )}
    </svg>
  );
}
