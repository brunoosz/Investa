import { useEffect, useRef } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { useUi } from "@/store/ui";

export interface ValuePoint {
  time: number;
  value: number;
}

export interface CandlePoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type SeriesSpec =
  | { kind: "area"; data: ValuePoint[]; color: string; id?: string }
  | { kind: "line"; data: ValuePoint[]; color: string; dashed?: boolean; id?: string; width?: number }
  | { kind: "candles"; data: CandlePoint[]; id?: string }
  | { kind: "volume"; data: CandlePoint[]; id?: string };

export interface HoverInfo {
  time: number;
  values: Record<string, number>;
}

function cssColor(name: string, alpha = 1): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(", ");
  return alpha === 1 ? `rgb(${v})` : `rgba(${v}, ${alpha})`;
}

/** Cor da série: nome de token ("primary", "chart-3"…) ou hex. */
function seriesColor(c: string, alpha = 1): string {
  if (!c.startsWith("#")) return cssColor(c, alpha);
  if (alpha === 1) return c;
  return c + Math.round(alpha * 255).toString(16).padStart(2, "0");
}

const tzOffset = () => -new Date().getTimezoneOffset() * 60;

export function Chart({
  series,
  height = 300,
  intraday,
  baseline,
  formatter,
  onHover,
  showTimeAxis = true,
  showPriceAxis = true,
}: {
  series: SeriesSpec[];
  height?: number;
  intraday?: boolean;
  baseline?: number;
  formatter: (v: number) => string;
  onHover?: (info: HoverInfo | null) => void;
  showTimeAxis?: boolean;
  showPriceAxis?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const theme = useUi((s) => s.resolvedTheme);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const fmtRef = useRef(formatter);
  fmtRef.current = formatter;

  useEffect(() => {
    if (!el.current) return;
    const muted = cssColor("muted");
    const chart = createChart(el.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: muted,
        fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      localization: { locale: "pt-BR", priceFormatter: (p: number) => fmtRef.current(p) },
      grid: { vertLines: { visible: false }, horzLines: { color: cssColor("line", 0.08) } },
      rightPriceScale: { visible: showPriceAxis, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { visible: showTimeAxis, borderVisible: false, timeVisible: !!intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: cssColor("line", 0.35), width: 1, style: LineStyle.Solid, labelBackgroundColor: cssColor("elevated") },
        horzLine: { color: cssColor("line", 0.25), width: 1, style: LineStyle.Dashed, labelBackgroundColor: cssColor("elevated") },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: false },
    });
    chartRef.current = chart;
    const shift = tzOffset();
    const apis: { id: string; api: ISeriesApi<SeriesType> }[] = [];

    series.forEach((s, i) => {
      const id = s.id ?? `s${i}`;
      if (s.kind === "area") {
        const a = chart.addSeries(AreaSeries, {
          lineColor: seriesColor(s.color),
          topColor: seriesColor(s.color, 0.33),
          bottomColor: seriesColor(s.color, 0),
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: showPriceAxis,
          crosshairMarkerRadius: 5,
          crosshairMarkerBorderColor: "#fff",
          crosshairMarkerBackgroundColor: seriesColor(s.color),
        });
        a.setData(s.data.map((p) => ({ time: (p.time + shift) as UTCTimestamp, value: p.value })));
        if (baseline !== undefined && i === 0) {
          a.createPriceLine({ price: baseline, color: cssColor("muted", 0.6), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
        }
        apis.push({ id, api: a as ISeriesApi<SeriesType> });
      } else if (s.kind === "line") {
        const l = chart.addSeries(LineSeries, {
          color: seriesColor(s.color),
          lineWidth: (s.width ?? 2) as 1 | 2 | 3 | 4,
          lineStyle: s.dashed ? LineStyle.Dashed : LineStyle.Solid,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: !s.dashed,
        });
        l.setData(s.data.map((p) => ({ time: (p.time + shift) as UTCTimestamp, value: p.value })));
        apis.push({ id, api: l as ISeriesApi<SeriesType> });
      } else if (s.kind === "candles") {
        const c = chart.addSeries(CandlestickSeries, {
          upColor: cssColor("success"),
          downColor: cssColor("danger"),
          borderVisible: false,
          wickUpColor: cssColor("success"),
          wickDownColor: cssColor("danger"),
          priceLineVisible: false,
        });
        c.setData(s.data.map((p) => ({ time: (p.time + shift) as UTCTimestamp, open: p.open, high: p.high, low: p.low, close: p.close })));
        apis.push({ id, api: c as ISeriesApi<SeriesType> });
      } else if (s.kind === "volume") {
        const v = chart.addSeries(HistogramSeries, { priceScaleId: "vol", priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false });
        v.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
        v.setData(
          s.data
            .filter((p) => p.volume)
            .map((p) => ({
              time: (p.time + shift) as UTCTimestamp,
              value: p.volume ?? 0,
              color: p.close >= p.open ? cssColor("success", 0.28) : cssColor("danger", 0.28),
            }))
        );
      }
    });

    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      const cb = hoverRef.current;
      if (!cb) return;
      if (!param.time || !param.point || param.point.x < 0) {
        cb(null);
        return;
      }
      const values: Record<string, number> = {};
      for (const { id, api } of apis) {
        const d = param.seriesData.get(api) as { value?: number; close?: number } | undefined;
        if (d) values[id] = d.value ?? d.close ?? NaN;
      }
      cb({ time: (param.time as number) - shift, values });
    });

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [series, intraday, baseline, theme, showTimeAxis, showPriceAxis]);

  return <div ref={el} style={{ height }} className="w-full" />;
}

export type { Time };
