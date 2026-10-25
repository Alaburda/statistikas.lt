// Small unconstrained optimiser. Bounded parameters (smoothing weights) are
// mapped through a logistic transform by the callers.

/** Nelder–Mead simplex minimisation of `f` from `x0`. */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  { step = 0.5, maxIter = 200 * x0.length, tol = 1e-8 } = {}
): { x: number[]; value: number } {
  const n = x0.length;
  if (n === 0) return { x: [], value: f([]) };
  const safe = (x: number[]) => {
    const v = f(x);
    return Number.isFinite(v) ? v : Number.MAX_VALUE;
  };
  let simplex: { x: number[]; v: number }[] = [{ x: x0.slice(), v: safe(x0) }];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += step;
    simplex.push({ x, v: safe(x) });
  }
  for (let iter = 0; iter < maxIter; iter++) {
    simplex.sort((a, b) => a.v - b.v);
    const best = simplex[0];
    const worst = simplex[n];
    if (Math.abs(worst.v - best.v) <= tol * (Math.abs(best.v) + tol)) break;
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    const along = (t: number) => centroid.map((c, j) => c + t * (worst.x[j] - c));
    const xr = along(-1);
    const vr = safe(xr);
    if (vr < best.v) {
      const xe = along(-2);
      const ve = safe(xe);
      simplex[n] = ve < vr ? { x: xe, v: ve } : { x: xr, v: vr };
    } else if (vr < simplex[n - 1].v) {
      simplex[n] = { x: xr, v: vr };
    } else {
      const xc = vr < worst.v ? along(-0.5) : along(0.5);
      const vc = safe(xc);
      if (vc < Math.min(vr, worst.v)) simplex[n] = { x: xc, v: vc };
      else {
        simplex = simplex.map((p, i) =>
          i === 0 ? p : (() => {
            const x = p.x.map((xi, j) => best.x[j] + 0.5 * (xi - best.x[j]));
            return { x, v: safe(x) };
          })()
        );
      }
    }
  }
  simplex.sort((a, b) => a.v - b.v);
  return { x: simplex[0].x, value: simplex[0].v };
}

export const logistic = (z: number) => 1 / (1 + Math.exp(-z));
export const logit = (p: number) => Math.log(p / (1 - p));
