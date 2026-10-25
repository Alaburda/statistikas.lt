// Runs the per-item forecasts off the main thread so the page stays responsive
// with thousands of items.

import type { SeriesData } from "./dataset";
import { type ForecastOptions, type ItemResult, forecastSeries } from "./pipeline";

export type WorkerRequest = { series: SeriesData[]; options: ForecastOptions };
export type WorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; results: ItemResult[] }
  | { type: "error"; message: string };

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { series, options } = e.data;
  try {
    const results: ItemResult[] = [];
    let lastPost = 0;
    series.forEach((s, i) => {
      results.push(forecastSeries(s, options));
      const now = Date.now();
      if (now - lastPost > 80) {
        lastPost = now;
        self.postMessage({ type: "progress", done: i + 1, total: series.length } satisfies WorkerResponse);
      }
    });
    self.postMessage({ type: "done", results } satisfies WorkerResponse);
  } catch (err) {
    self.postMessage({ type: "error", message: err instanceof Error ? err.message : String(err) } satisfies WorkerResponse);
  }
};
