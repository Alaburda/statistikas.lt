// Numerical routines for the distributions behind power calculations. Ported from
// the published algorithms R itself uses, so results agree with R to many digits
// (see reference.test.ts). No server, no WASM: the first calculation is instant.

const FPMIN = 1e-300;

/** Natural log of the gamma function: Stirling's series, shifted up to x >= 10. */
export function logGamma(x: number): number {
  let shift = 0;
  while (x < 10) {
    shift += Math.log(x);
    x += 1;
  }
  const r = 1 / (x * x);
  const series = (1 / 12 - r * (1 / 360 - r * (1 / 1260 - r * (1 / 1680 - r * (1 / 1188 - (r * 691) / 360360))))) / x;
  return (x - 0.5) * Math.log(x) - x + 0.91893853320467274 + series - shift;
}

/** Standard normal density. */
export function dnorm(x: number): number {
  return 0.398942280401432678 * Math.exp(-0.5 * x * x);
}

/** Standard normal CDF (West 2005, double precision version of Hart's algorithm). */
export function pnorm(x: number): number {
  const z = Math.abs(x);
  let c = 0;
  if (z <= 37) {
    const e = Math.exp(-0.5 * z * z);
    if (z < 7.07106781186547) {
      let b = 3.52624965998911e-2 * z + 0.700383064443688;
      b = b * z + 6.37396220353165;
      b = b * z + 33.912866078383;
      b = b * z + 112.079291497871;
      b = b * z + 221.213596169931;
      b = b * z + 220.206867912376;
      c = e * b;
      b = 8.83883476483184e-2 * z + 1.75566716318264;
      b = b * z + 16.064177579207;
      b = b * z + 86.7807322029461;
      b = b * z + 296.564248779674;
      b = b * z + 637.333633378831;
      b = b * z + 793.826512519948;
      b = b * z + 440.413735824752;
      c /= b;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      c = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - c : c;
}

/** Inverse standard normal CDF (Wichura's AS 241), polished with one Newton step. */
export function qnorm(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const q = p - 0.5;
  let x: number;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    x =
      (q *
        (((((((r * 2509.0859297353021 + 33430.575583588128) * r + 67265.770927008700) * r + 45921.953931549871) * r +
          13731.693765509461) * r + 1971.5909503065514) * r + 133.14166789178438) * r + 3.3871328727963666)) /
      (((((((r * 5226.4952788528546 + 28729.085735721943) * r + 39307.895800092711) * r + 21213.794301586596) * r +
        5394.1960214247511) * r + 687.18700749205791) * r + 42.313330701600911) * r + 1);
  } else {
    let r = q < 0 ? p : 1 - p;
    r = Math.sqrt(-Math.log(r));
    if (r <= 5) {
      r -= 1.6;
      x =
        (((((((r * 7.7454501427834141e-4 + 0.022723844989269184) * r + 0.24178072517745061) * r + 1.2704582524523684) * r +
          3.6478483247632046) * r + 5.7694972214606914) * r + 4.6303378461565453) * r + 1.4234371107496836) /
        (((((((r * 1.05075007164441684e-9 + 5.475938084995345e-4) * r + 0.015198666563616457) * r + 0.14810397642748008) * r +
          0.68976733498510001) * r + 1.6763848301838038) * r + 2.0531916266377588) * r + 1);
    } else {
      r -= 5;
      x =
        (((((((r * 2.0103343992922881e-7 + 2.7115555687434876e-5) * r + 0.0012426609473880784) * r + 0.026532189526576124) * r +
          0.29656057182850489) * r + 1.7848265399172913) * r + 5.4637849111641144) * r + 6.6579046435011038) /
        (((((((r * 2.0442631033899397e-15 + 1.4215117583164459e-7) * r + 1.8463183175100547e-5) * r + 7.8686913114561326e-4) * r +
          0.014875361290850615) * r + 0.13692988092273581) * r + 0.59983322065588794) * r + 1);
    }
    if (q < 0) x = -x;
  }
  return x - (pnorm(x) - p) / dnorm(x);
}

function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 20000; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function pbeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Lower regularized incomplete gamma function P(a, x). */
export function pgamma(x: number, a: number): number {
  if (x <= 0) return 0;
  const lead = -x + a * Math.log(x) - logGamma(a);
  if (x < a + 1) {
    let sum = 1 / a;
    let del = sum;
    let ap = a;
    for (let n = 0; n < 5000; n++) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-16) break;
    }
    return sum * Math.exp(lead);
  }
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 5000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-16) break;
  }
  return 1 - Math.exp(lead) * h;
}

/** Student-t CDF. */
export function pt(t: number, df: number): number {
  const ib = pbeta(df / (df + t * t), df / 2, 0.5);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function dt(t: number, df: number): number {
  const lead = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  return Math.exp(lead - ((df + 1) / 2) * Math.log1p((t * t) / df));
}

/** Safeguarded Newton: root of an increasing function inside a bracket. */
function invert(f: (x: number) => number, df: (x: number) => number, start: number, lo: number, hi: number): number {
  let x = start;
  for (let i = 0; i < 200; i++) {
    const e = f(x);
    if (e < 0) lo = x;
    else hi = x;
    let next = x - e / df(x);
    if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    if (Math.abs(next - x) <= 1e-13 * (1 + Math.abs(x))) return next;
    x = next;
  }
  return x;
}

/** Inverse Student-t CDF. */
export function qt(p: number, df: number): number {
  if (p === 0.5) return 0;
  if (p < 0.5) return -qt(1 - p, df);
  let hi = 2;
  while (pt(hi, df) < p) hi *= 2;
  return invert(
    (x) => pt(x, df) - p,
    (x) => dt(x, df),
    Math.min(qnorm(p), hi / 2),
    0,
    hi
  );
}

/** Inverse chi-square CDF. */
export function qchisq(p: number, df: number): number {
  const a = df / 2;
  const density = (x: number) => Math.exp((a - 1) * Math.log(x / 2) - x / 2 - logGamma(a)) / 2;
  let hi = df + 10;
  while (pgamma(hi / 2, a) < p) hi *= 2;
  // Wilson–Hilferty start.
  const k = 2 / (9 * df);
  const start = df * Math.pow(Math.max(1 - k + qnorm(p) * Math.sqrt(k), 0.01), 3);
  return invert((x) => pgamma(x / 2, a) - p, density, Math.min(Math.max(start, 1e-8), hi / 2), 0, hi);
}

/** Non-central t CDF. Port of R's pnt.c (Lenth's AS 243 with R's safeguards). */
export function pnct(t: number, df: number, ncp: number): number {
  if (ncp === 0) return pt(t, df);
  if (!Number.isFinite(t)) return t < 0 ? 0 : 1;
  let negdel = false;
  let tt = t;
  let del = ncp;
  if (t < 0) {
    if (ncp > 40) return 0;
    negdel = true;
    tt = -t;
    del = -ncp;
  }
  if (df > 4e5 || del * del > 2 * Math.LN2 * 1021) {
    const s = 1 / (4 * df);
    const p = pnorm((tt * (1 - s) - del) / Math.sqrt(1 + 2 * tt * tt * s));
    return negdel ? 1 - p : p;
  }
  let x = t * t;
  const rxbBase = df / (x + df);
  x = x / (x + df);
  let tnc = 0;
  if (x > 0) {
    const lambda = del * del;
    let p = 0.5 * Math.exp(-0.5 * lambda);
    let q = 0.797884560802865356 * p * del;
    let s = 0.5 - p;
    if (s < 1e-7) s = -0.5 * Math.expm1(-0.5 * lambda);
    let a = 0.5;
    const b = 0.5 * df;
    const rxb = Math.pow(rxbBase, b);
    const albeta = 0.572364942924700087 + logGamma(b) - logGamma(0.5 + b);
    let xodd = pbeta(x, a, b);
    let godd = 2 * rxb * Math.exp(a * Math.log(x) - albeta);
    tnc = b * x;
    let xeven = tnc < 2.220446e-16 ? tnc : 1 - rxb;
    let geven = tnc * rxb;
    tnc = p * xodd + q * xeven;
    for (let it = 1; it <= 1000; it++) {
      a += 1;
      xodd -= godd;
      xeven -= geven;
      godd *= (x * (a + b - 1)) / a;
      geven *= (x * (a + b - 0.5)) / (a + 0.5);
      p *= lambda / (2 * it);
      q *= lambda / (2 * it + 1);
      tnc += p * xodd + q * xeven;
      s -= p;
      if (s < -1e-10) break;
      if (s <= 0 && it > 1) break;
      if (Math.abs(2 * s * (xodd - godd)) < 1e-12) break;
    }
  }
  tnc += pnorm(-del);
  tnc = Math.min(tnc, 1);
  return negdel ? 1 - tnc : tnc;
}

/** Inverse central F CDF (upper-tail probability alpha), via the incomplete beta. */
export function qfUpper(alpha: number, df1: number, df2: number): number {
  let lo = 0;
  let hi = 1;
  const upper = (y: number) => 1 - pbeta(y, df1 / 2, df2 / 2);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (upper(mid) > alpha) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-15) break;
  }
  const y = (lo + hi) / 2;
  return ((df2 / df1) * y) / (1 - y);
}

/** Non-central F CDF. Port of R's pnbeta (AS 226 with Frick's R84). */
export function pnf(f: number, df1: number, df2: number, ncp: number): number {
  if (f <= 0) return 0;
  const y = (df1 / df2) * f;
  const x = y / (1 + y);
  const a = df1 / 2;
  const b = df2 / 2;
  if (ncp === 0) return pbeta(x, a, b);
  const c = ncp / 2;
  const x0 = Math.floor(Math.max(c - 7 * Math.sqrt(c), 0));
  const start = a + x0;
  const lbeta = logGamma(start) + logGamma(b) - logGamma(start + b);
  let temp = pbeta(x, start, b);
  let gx = Math.exp(start * Math.log(x) + b * Math.log1p(-x) - lbeta - Math.log(start));
  let q = x0 > 0 ? Math.exp(-c + x0 * Math.log(c) - logGamma(x0 + 1)) : Math.exp(-c);
  let sumq = 1 - q;
  let ans = q * temp;
  let j = x0;
  let errbd: number;
  do {
    j += 1;
    temp -= gx;
    gx *= (x * (a + b + j - 1)) / (a + j);
    q *= c / j;
    sumq -= q;
    ans += temp * q;
    errbd = (temp - gx) * sumq;
  } while (errbd > 1e-12 && j < x0 + 10000);
  return Math.min(ans, 1);
}

/** Gauss–Legendre nodes and weights on [-1, 1], from Newton on the Legendre polynomial. */
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = [];
  const w: number[] = [];
  for (let i = 0; i < n; i++) {
    let z = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let pp = 0;
    for (let it = 0; it < 100; it++) {
      let p1 = 1;
      let p2 = 0;
      for (let j = 1; j <= n; j++) {
        const p3 = p2;
        p2 = p1;
        p1 = ((2 * j - 1) * z * p2 - (j - 1) * p3) / j;
      }
      pp = (n * (z * p1 - p2)) / (z * z - 1);
      const dz = p1 / pp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * pp * pp));
  }
  return { x, w };
}

const GL = gaussLegendre(16);

/**
 * Owen's Q with lower limit 0: Q_nu(t, delta; 0, b) = E[Phi(tX/sqrt(nu) - delta); X < b],
 * X ~ chi(nu). Integrated directly: the chi density is a narrow bump around sqrt(nu),
 * so composite Gauss–Legendre over its effective support reaches double precision.
 */
export function owensQ(nu: number, t: number, delta: number, b: number): number {
  if (b <= 0) return 0;
  const centre = Math.sqrt(Math.max(nu - 0.5, 0));
  const lo = Math.max(0, centre - 10);
  const hi = Math.min(b, centre + 10);
  if (hi <= lo) return 0;
  const logC = -logGamma(nu / 2) - (nu / 2 - 1) * Math.LN2;
  const slope = t / Math.sqrt(nu);
  const panels = Math.max(4, Math.ceil((hi - lo) / 0.75));
  const h = (hi - lo) / panels;
  let sum = 0;
  for (let i = 0; i < panels; i++) {
    const mid = lo + (i + 0.5) * h;
    for (let k = 0; k < GL.x.length; k++) {
      const x = mid + 0.5 * h * GL.x[k];
      if (x <= 0) continue;
      sum += GL.w[k] * pnorm(slope * x - delta) * Math.exp(logC + (nu - 1) * Math.log(x) - 0.5 * x * x);
    }
  }
  return 0.5 * h * sum;
}
