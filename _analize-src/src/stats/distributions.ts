// Numerical routines for statistical distributions.
// Implementations follow the standard algorithms in Numerical Recipes
// (incomplete gamma / incomplete beta via series + continued fractions).
// These give p-values without any server or external dependency.

const EPS = 3e-12;
const FPMIN = 1e-300;

/** Natural log of the gamma function (Lanczos approximation). */
export function logGamma(x: number): number {
  const c = [
    76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += c[j] / y;
  }
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

/** Lower regularized incomplete gamma P(a, x) via series expansion. */
function gammpSeries(a: number, x: number): number {
  let sum = 1 / a;
  let del = sum;
  let ap = a;
  for (let n = 0; n < 200; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Upper regularized incomplete gamma Q(a, x) via continued fraction. */
function gammqContinued(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/** Lower regularized incomplete gamma function P(a, x). */
export function gammp(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) return gammpSeries(a, x);
  return 1 - gammqContinued(a, x);
}

/** Continued fraction for the incomplete beta function. */
function betacf(a: number, b: number, x: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
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
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta function I_x(a, b). */
export function betai(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Standard normal CDF. */
export function normalCdf(z: number): number {
  return 1 - normalUpper(z);
}

/** Error function via the incomplete gamma function: erf(x) = P(½, x²). */
export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  return sign * gammp(0.5, x * x);
}

/** Upper-tail standard normal probability P(Z > z), accurate far into the tail. */
function normalUpper(z: number): number {
  if (z < 0) return 1 - normalUpper(-z);
  if (z === 0) return 0.5;
  const x = (z * z) / 2;
  // Q(½, x) directly avoids cancellation in 1 − P for large |z|.
  return 0.5 * (x < 1.5 ? 1 - gammpSeries(0.5, x) : gammqContinued(0.5, x));
}

/** Two-tailed p-value for Student's t with df degrees of freedom. */
export function tTwoTailedP(t: number, df: number): number {
  const x = df / (df + t * t);
  return betai(df / 2, 0.5, x);
}

/** Upper-tail p-value for the F distribution (P(F > f)). */
export function fUpperP(f: number, df1: number, df2: number): number {
  if (f <= 0) return 1;
  return betai(df2 / 2, df1 / 2, df2 / (df2 + df1 * f));
}

/** Upper-tail p-value for the chi-square distribution (P(X^2 > x)). */
export function chiSquareUpperP(x: number, df: number): number {
  if (x <= 0) return 1;
  return 1 - gammp(df / 2, x / 2);
}

/** Two-tailed p-value for a standard normal z statistic. */
export function zTwoTailedP(z: number): number {
  return Math.min(1, 2 * normalUpper(Math.abs(z)));
}

/** Inverse standard normal CDF (Acklam's algorithm) — used for CI multipliers. */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number, r: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= phigh) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * Fisher's exact test for a 2×2 table [[a, b], [c, d]], two-sided.
 * Sums hypergeometric probabilities of all tables (with the same margins)
 * that are no more likely than the observed one — matching R's fisher.test.
 */
export function fisherExact2x2(a: number, b: number, c: number, d: number): number {
  const logChoose = (n: number, k: number) =>
    logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
  const r1 = a + b;
  const r2 = c + d;
  const c1 = a + c;
  const n = a + b + c + d;
  const logDenom = logChoose(n, c1);
  const prob = (x: number) => Math.exp(logChoose(r1, x) + logChoose(r2, c1 - x) - logDenom);
  const lo = Math.max(0, c1 - r2);
  const hi = Math.min(c1, r1);
  const pObs = prob(a);
  let p = 0;
  for (let x = lo; x <= hi; x++) {
    const px = prob(x);
    if (px <= pObs * (1 + 1e-7)) p += px;
  }
  return Math.min(1, p);
}

/** Student-t CDF. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const ib = betai(df / 2, 0.5, x);
  return t > 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

/** Inverse Student-t CDF via bisection on tCdf — precise enough for CI multipliers. */
export function tQuantile(p: number, df: number): number {
  let lo = -1000;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- Studentized range distribution (Tukey HSD, Games–Howell) ----------
// Port of R's ptukey.c (Copenhaver & Holland, 1988, J. Statist. Comput. Simul. 30, 1–15):
// Gauss–Legendre quadrature over Hartley's form of the range distribution.

const XLEG = [
  0.98156063424671925069, 0.904117256370474856678, 0.769902674194304687037,
  0.587317954286617447297, 0.367831498998180193753, 0.125233408511468915472,
];
const ALEG = [
  0.047175336386511827195, 0.106939325995318430960, 0.160078328543346226335,
  0.203167426723065921749, 0.233492536538354808761, 0.249147045813402785001,
];

/** P(range of cc standard normals < w), raised to rr (rr = 1 here). */
function wprob(w: number, rr: number, cc: number): number {
  const nleg = 12;
  const ihalf = 6;
  const C1 = -30;
  const C2 = -50;
  const C3 = 60;
  const bb = 8;
  const wlar = 3;
  const qsqz = w * 0.5;
  if (qsqz >= bb) return 1;
  let prW = 2 * normalCdf(qsqz) - 1;
  prW = prW >= Math.exp(C2 / cc) ? Math.pow(prW, cc) : 0;
  const wincr = w > wlar ? 2 : 3;
  let blb = qsqz;
  const binc = (bb - qsqz) / wincr;
  let bub = blb + binc;
  let einsum = 0;
  const cc1 = cc - 1;
  for (let wi = 1; wi <= wincr; wi++) {
    let elsum = 0;
    const a = 0.5 * (bub + blb);
    const b = 0.5 * (bub - blb);
    for (let jj = 1; jj <= nleg; jj++) {
      let j: number;
      let xx: number;
      if (ihalf < jj) {
        j = nleg - jj + 1;
        xx = XLEG[j - 1];
      } else {
        j = jj;
        xx = -XLEG[j - 1];
      }
      const ac = a + b * xx;
      const qexpo = ac * ac;
      if (qexpo > C3) break;
      const pplus = 2 * normalCdf(ac);
      const pminus = 2 * normalCdf(ac - w);
      let rinsum = pplus * 0.5 - pminus * 0.5;
      if (rinsum >= Math.exp(C1 / cc1)) {
        rinsum = ALEG[j - 1] * Math.exp(-(0.5 * qexpo)) * Math.pow(rinsum, cc1);
        elsum += rinsum;
      }
    }
    elsum *= (2 * b * cc) / Math.sqrt(2 * Math.PI);
    einsum += elsum;
    blb = bub;
    bub += binc;
  }
  prW += einsum;
  if (prW <= Math.exp(C1 / rr)) return 0;
  prW = Math.pow(prW, rr);
  return prW >= 1 ? 1 : prW;
}

const XLEGQ = [
  0.98940093499164993260, 0.944575023073232576078, 0.865631202387831743880,
  0.755404408355003033895, 0.617876244402643748447, 0.458016777657227386342,
  0.281603550779258913230, 0.950125098376374401853e-1,
];
const ALEGQ = [
  0.271524594117540948518e-1, 0.622535239386478928628e-1, 0.951585116824927848099e-1,
  0.124628971255533872052, 0.149595988816576732082, 0.169156519395002538189,
  0.182603415044923588867, 0.189450610455068496285,
];

/** Lower-tail CDF of the studentized range: P(Q < q) for nmeans groups and df error df. */
export function ptukey(q: number, nmeans: number, df: number): number {
  const rr = 1;
  const cc = nmeans;
  if (q <= 0) return 0;
  if (!Number.isFinite(q)) return 1;
  if (df > 25000) return wprob(q, rr, cc);
  const nlegq = 16;
  const ihalfq = 8;
  const eps1 = -30;
  const eps2 = 1e-14;
  const f2 = df * 0.5;
  let f2lf = f2 * Math.log(df) - df * Math.LN2 - logGamma(f2);
  const f21 = f2 - 1;
  const ff4 = df * 0.25;
  const ulen = df <= 100 ? 1 : df <= 800 ? 0.5 : df <= 5000 ? 0.25 : 0.125;
  f2lf += Math.log(ulen);
  let ans = 0;
  for (let i = 1; i <= 50; i++) {
    let otsum = 0;
    const twa1 = (2 * i - 1) * ulen;
    for (let jj = 1; jj <= nlegq; jj++) {
      let j: number;
      let t1: number;
      if (ihalfq < jj) {
        j = jj - ihalfq - 1;
        t1 = f2lf + f21 * Math.log(twa1 + XLEGQ[j] * ulen) - (XLEGQ[j] * ulen + twa1) * ff4;
      } else {
        j = jj - 1;
        t1 = f2lf + f21 * Math.log(twa1 - XLEGQ[j] * ulen) + (XLEGQ[j] * ulen - twa1) * ff4;
      }
      if (t1 >= eps1) {
        const qsqz =
          ihalfq < jj ? q * Math.sqrt((XLEGQ[j] * ulen + twa1) * 0.5) : q * Math.sqrt((-(XLEGQ[j] * ulen) + twa1) * 0.5);
        otsum += wprob(qsqz, rr, cc) * ALEGQ[j] * Math.exp(t1);
      }
    }
    if (i * ulen >= 1 && otsum <= eps2) break;
    ans += otsum;
  }
  return Math.min(ans, 1);
}

/** Inverse of ptukey by bisection (for Tukey confidence intervals). */
export function qtukey(p: number, nmeans: number, df: number): number {
  let lo = 0;
  let hi = 100;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (ptukey(mid, nmeans, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
