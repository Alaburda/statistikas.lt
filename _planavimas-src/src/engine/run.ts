// Main-thread entry point for forecasting: a Web Worker when available, an
// in-page loop (yielding between chunks) otherwise.

import type { SeriesData } from "./dataset";
import { type ForecastOptions, type ItemResult, forecastSeries } from "./pipeline";
import type { WorkerResponse } from "./worker";

export function runForecasts(
  series: SeriesData[],
  options: ForecastOptions,
  onProgress: (done: number, total: number) => void
): Promise<ItemResult[]> {
  if (typeof Worker !== "undefined") {
    try {
      const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      return new Promise((resolve, reject) => {
        worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
          const msg = e.data;
          if (msg.type === "progress") onProgress(msg.done, msg.total);
          else {
            worker.terminate();
            if (msg.type === "done") resolve(msg.results);
            else reject(new Error(msg.message));
          }
        };
        worker.onerror = (ev) => {
          worker.terminate();
          ev.preventDefault();
          // Fall back to the main thread (e.g. a browser that blocks module workers).
          runInPage(series, options, onProgress).then(resolve, reject);
        };
        worker.postMessage({ series, options });
      });
    } catch {
      /* fall through */
    }
  }
  return runInPage(series, options, onProgress);
}

async function runInPage(
  series: SeriesData[],
  options: ForecastOptions,
  onProgress: (done: number, total: number) => void
): Promise<ItemResult[]> {
  const out: ItemResult[] = [];
  for (let i = 0; i < series.length; i++) {
    out.push(forecastSeries(series[i], options));
    if (i % 20 === 19) {
      onProgress(i + 1, series.length);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return out;
}
