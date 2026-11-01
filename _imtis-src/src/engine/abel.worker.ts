// ABEL power is simulated, so it runs off the main thread and inputs stay responsive.
import { DEFAULT_SIMS, powerABEL, sampleNABEL, type AbelDesign } from "./abel";

export interface AbelJob {
  id: number;
  design: AbelDesign;
  cv: number;
  theta0: number;
  target: number;
  alpha: number;
  /** Set when power is wanted for a given n instead of a sample size. */
  n: number | null;
}

export interface AbelResult {
  id: number;
  n: number | null;
  power: number;
  scenarios: { cv: number; theta0: number; n: number | null }[];
  sims: number;
}

self.onmessage = (e: MessageEvent<AbelJob>) => {
  const { id, design, cv, theta0, target, alpha, n } = e.data;
  if (n !== null) {
    const out: AbelResult = { id, n, power: powerABEL(design, cv, theta0, n, alpha), scenarios: [], sims: DEFAULT_SIMS };
    self.postMessage(out);
    return;
  }
  const res = sampleNABEL(design, cv, theta0, target, alpha);
  const scenarios: AbelResult["scenarios"] = [];
  for (const dc of [-0.05, 0, 0.1]) {
    for (const t0 of [0.9, 0.95]) {
      const scv = cv + dc;
      if (scv <= 0) continue;
      scenarios.push({ cv: scv, theta0: t0, n: sampleNABEL(design, scv, t0, target, alpha)?.n ?? null });
    }
  }
  const out: AbelResult = { id, n: res?.n ?? null, power: res?.power ?? NaN, scenarios, sims: DEFAULT_SIMS };
  self.postMessage(out);
};
