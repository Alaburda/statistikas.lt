import type { AnalysisResult, TestDefinition } from "../types";
import {
  chiSquareUpperP,
  fUpperP,
  tTwoTailedP,
  tQuantile,
  zTwoTailedP,
} from "./distributions";
import { fmt, fmtP, significanceNote } from "./format";
import {
  getVar,
  groupNumeric,
  levelLabel,
  mean,
  median,
  numericColumn,
  pairedNumeric,
  quantile,
  sd,
  variance,
} from "./helpers";

// ---------- Descriptive statistics ----------
const descriptives: TestDefinition = {
  id: "descriptives",
  name: "Descriptive statistics",
  blurb: "Summarise one numeric variable: mean, SD, median, quartiles, range.",
  methods: "Descriptive statistics (means, standard deviations, medians, and interquartile ranges) were computed for continuous variables.",
  inputs: [{ id: "var", label: "Variable", accepts: "numeric" }],
  run: (ds, picks): AnalysisResult => {
    const v = getVar(ds, picks.var);
    const x = numericColumn(ds, picks.var);
    const sorted = [...x].sort((a, b) => a - b);
    const m = mean(x);
    const s = sd(x);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const med = median(x);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return {
      description:
        `${v.label} has ${x.length} non-missing observations. ` +
        `The mean is ${fmt(m)}${v.unit ? " " + v.unit : ""} (SD = ${fmt(s)}), ` +
        `and the median is ${fmt(med)} (IQR ${fmt(q1)}–${fmt(q3)}). ` +
        `Values range from ${fmt(min)} to ${fmt(max)}.`,
      tables: [
        {
          title: `Descriptive statistics — ${v.label}`,
          columns: ["Statistic", "Value"],
          rows: [
            ["N", x.length],
            ["Mean", fmt(m)],
            ["Std. deviation", fmt(s)],
            ["Minimum", fmt(min)],
            ["25th percentile", fmt(q1)],
            ["Median", fmt(med)],
            ["75th percentile", fmt(q3)],
            ["Maximum", fmt(max)],
          ],
        },
      ],
      plot: { kind: "histogram", title: `Distribution of ${v.label}`, values: x, xLabel: v.label },
    };
  },
};

// ---------- Frequency table (one categorical) ----------
const frequencies: TestDefinition = {
  id: "frequencies",
  name: "Frequency table",
  blurb: "Counts and percentages for the levels of one categorical variable.",
  methods: "Frequency distributions (counts and percentages) were computed for categorical variables.",
  inputs: [{ id: "var", label: "Variable", accepts: "categorical" }],
  run: (ds, picks): AnalysisResult => {
    const v = getVar(ds, picks.var);
    const counts = new Map<string, number>();
    let total = 0;
    for (const row of ds.rows) {
      const val = row[picks.var];
      if (val === null || val === undefined || val === "") continue;
      const k = String(val);
      counts.set(k, (counts.get(k) ?? 0) + 1);
      total++;
    }
    const entries = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const top = entries.reduce((a, b) => (b[1] > a[1] ? b : a));
    return {
      description:
        `${v.label} has ${entries.length} categories across ${total} observations. ` +
        `The most common category is "${levelLabel(v, top[0])}" (${top[1]}, ` +
        `${fmt((100 * top[1]) / total, 1)}%).`,
      tables: [
        {
          title: `Frequencies — ${v.label}`,
          columns: ["Category", "Count", "Percent"],
          rows: entries.map(([k, c]) => [levelLabel(v, k), c, fmt((100 * c) / total, 1) + "%"]),
        },
      ],
      plot: {
        kind: "bar",
        title: `Frequencies of ${v.label}`,
        xLabel: v.label,
        yLabel: "Count",
        series: [
          { label: "Count", values: entries.map(([k, c]) => ({ x: levelLabel(v, k), y: c })) },
        ],
      },
    };
  },
};

// ---------- Independent-samples t-test (Welch) ----------
const tTest: TestDefinition = {
  id: "ttest",
  name: "Independent t-test",
  blurb: "Compare the mean of a numeric variable between two groups (Welch's t).",
  methods: "Independent-samples t-tests with Welch's correction for unequal variances were used to compare means between two independent groups. Cohen's d was calculated as a measure of effect size.",
  inputs: [
    { id: "outcome", label: "Numeric outcome", accepts: "numeric" },
    { id: "group", label: "Grouping variable (2 groups)", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length !== 2) {
      throw new Error(
        `Independent t-test needs exactly 2 groups, but "${grpVar.label}" has ${groups.length}. Use ANOVA for 3+ groups.`
      );
    }
    const [a, b] = groups;
    const ma = mean(a.values);
    const mb = mean(b.values);
    const va = variance(a.values);
    const vb = variance(b.values);
    const na = a.values.length;
    const nb = b.values.length;
    const se = Math.sqrt(va / na + vb / nb);
    const t = (ma - mb) / se;
    // Welch–Satterthwaite degrees of freedom
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const p = tTwoTailedP(t, df);
    const diff = ma - mb;
    const tcrit = tQuantile(0.975, df);
    const ciLo = diff - tcrit * se;
    const ciHi = diff + tcrit * se;
    // Cohen's d using pooled SD
    const pooledSd = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
    const d = diff / pooledSd;
    return {
      pValue: p,
      description:
        `An independent-samples (Welch) t-test compared ${outVar.label} between ` +
        `${grpVar.label} = "${a.label}" (M = ${fmt(ma)}, SD = ${fmt(sd(a.values))}, n = ${na}) and ` +
        `"${b.label}" (M = ${fmt(mb)}, SD = ${fmt(sd(b.values))}, n = ${nb}). ` +
        `The difference of ${fmt(diff)} (95% CI ${fmt(ciLo)} to ${fmt(ciHi)}) was ` +
        `${significanceNote(p)}, t(${fmt(df, 1)}) = ${fmt(t)}, p ${fmtPInline(p)}. ` +
        `Effect size Cohen's d = ${fmt(d)}.`,
      tables: [
        {
          title: "Group statistics",
          columns: ["Group", "N", "Mean", "Std. deviation"],
          rows: [
            [a.label, na, fmt(ma), fmt(sd(a.values))],
            [b.label, nb, fmt(mb), fmt(sd(b.values))],
          ],
        },
        {
          title: "Independent-samples test (Welch)",
          columns: ["t", "df", "p", "Mean diff.", "95% CI", "Cohen's d"],
          rows: [[fmt(t), fmt(df, 1), fmtP(p), fmt(diff), `${fmt(ciLo)} to ${fmt(ciHi)}`, fmt(d)]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `${outVar.label} by ${grpVar.label}`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

// ---------- One-way ANOVA ----------
const anova: TestDefinition = {
  id: "anova",
  name: "One-way ANOVA",
  blurb: "Compare the mean of a numeric variable across 3+ groups.",
  methods: "One-way analysis of variance (ANOVA) was used to compare means across groups. Eta-squared (η²) was reported as a measure of effect size.",
  inputs: [
    { id: "outcome", label: "Numeric outcome", accepts: "numeric" },
    { id: "group", label: "Grouping variable", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length < 2) throw new Error("ANOVA needs at least 2 groups.");
    const allValues = groups.flatMap((g) => g.values);
    const grandMean = mean(allValues);
    const k = groups.length;
    const N = allValues.length;
    let ssBetween = 0;
    let ssWithin = 0;
    for (const g of groups) {
      const gm = mean(g.values);
      ssBetween += g.values.length * (gm - grandMean) ** 2;
      for (const v of g.values) ssWithin += (v - gm) ** 2;
    }
    const dfBetween = k - 1;
    const dfWithin = N - k;
    const msBetween = ssBetween / dfBetween;
    const msWithin = ssWithin / dfWithin;
    const F = msBetween / msWithin;
    const p = fUpperP(F, dfBetween, dfWithin);
    const etaSq = ssBetween / (ssBetween + ssWithin);
    return {
      pValue: p,
      description:
        `A one-way ANOVA tested whether mean ${outVar.label} differs across the ` +
        `${k} levels of ${grpVar.label}. The effect was ${significanceNote(p)}, ` +
        `F(${dfBetween}, ${dfWithin}) = ${fmt(F)}, p ${fmtPInline(p)}, η² = ${fmt(etaSq)}.`,
      tables: [
        {
          title: "Group means",
          columns: ["Group", "N", "Mean", "Std. deviation"],
          rows: groups.map((g) => [g.label, g.values.length, fmt(mean(g.values)), fmt(sd(g.values))]),
        },
        {
          title: "ANOVA",
          columns: ["Source", "SS", "df", "MS", "F", "p"],
          rows: [
            ["Between groups", fmt(ssBetween), dfBetween, fmt(msBetween), fmt(F), fmtP(p)],
            ["Within groups", fmt(ssWithin), dfWithin, fmt(msWithin), "", ""],
            ["Total", fmt(ssBetween + ssWithin), N - 1, "", "", ""],
          ],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `${outVar.label} by ${grpVar.label}`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

// ---------- Chi-square test of independence ----------
const chiSquare: TestDefinition = {
  id: "chisq",
  name: "Chi-square test",
  blurb: "Test whether two categorical variables are associated.",
  methods: "Chi-square tests of independence were used to assess associations between categorical variables. Cramér's V was reported as a measure of association strength.",
  inputs: [
    { id: "rowVar", label: "Row variable", accepts: "categorical" },
    { id: "colVar", label: "Column variable", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const rv = getVar(ds, picks.rowVar);
    const cv = getVar(ds, picks.colVar);
    const rowLevels = new Set<string>();
    const colLevels = new Set<string>();
    const cell = new Map<string, number>();
    let n = 0;
    for (const row of ds.rows) {
      const r = row[picks.rowVar];
      const c = row[picks.colVar];
      if (r === null || r === undefined || r === "" || c === null || c === undefined || c === "")
        continue;
      const rk = String(r);
      const ck = String(c);
      rowLevels.add(rk);
      colLevels.add(ck);
      cell.set(`${rk}|${ck}`, (cell.get(`${rk}|${ck}`) ?? 0) + 1);
      n++;
    }
    const rows = [...rowLevels].sort();
    const cols = [...colLevels].sort();
    const rowTot = new Map<string, number>();
    const colTot = new Map<string, number>();
    for (const r of rows)
      for (const c of cols) {
        const o = cell.get(`${r}|${c}`) ?? 0;
        rowTot.set(r, (rowTot.get(r) ?? 0) + o);
        colTot.set(c, (colTot.get(c) ?? 0) + o);
      }
    let chi2 = 0;
    for (const r of rows)
      for (const c of cols) {
        const o = cell.get(`${r}|${c}`) ?? 0;
        const e = (rowTot.get(r)! * colTot.get(c)!) / n;
        if (e > 0) chi2 += (o - e) ** 2 / e;
      }
    const df = (rows.length - 1) * (cols.length - 1);
    const p = chiSquareUpperP(chi2, df);
    const cramersV = Math.sqrt(chi2 / (n * Math.min(rows.length - 1, cols.length - 1)));
    const contingencyCols = ["", ...cols.map((c) => levelLabel(cv, c)), "Total"];
    const contingencyRows = rows.map((r) => [
      levelLabel(rv, r),
      ...cols.map((c) => cell.get(`${r}|${c}`) ?? 0),
      rowTot.get(r)!,
    ]);
    contingencyRows.push(["Total", ...cols.map((c) => colTot.get(c)!), n]);
    return {
      pValue: p,
      description:
        `A chi-square test of independence examined the association between ${rv.label} and ` +
        `${cv.label} (N = ${n}). The association was ${significanceNote(p)}, ` +
        `χ²(${df}) = ${fmt(chi2)}, p ${fmtPInline(p)}. Cramér's V = ${fmt(cramersV)}.`,
      tables: [
        { title: `Crosstab: ${rv.label} × ${cv.label}`, columns: contingencyCols, rows: contingencyRows },
        {
          title: "Chi-square test",
          columns: ["χ²", "df", "p", "Cramér's V", "N"],
          rows: [[fmt(chi2), df, fmtP(p), fmt(cramersV), n]],
        },
      ],
      plot: {
        kind: "bar",
        title: `${rv.label} by ${cv.label}`,
        xLabel: rv.label,
        yLabel: "Count",
        series: cols.map((c) => ({
          label: levelLabel(cv, c),
          values: rows.map((r) => ({ x: levelLabel(rv, r), y: cell.get(`${r}|${c}`) ?? 0 })),
        })),
      },
    };
  },
};

// ---------- Pearson correlation ----------
const correlation: TestDefinition = {
  id: "correlation",
  name: "Pearson correlation",
  blurb: "Measure the linear association between two numeric variables.",
  methods: "Pearson product-moment correlations were calculated to assess linear associations between continuous variables.",
  inputs: [
    { id: "x", label: "Variable X", accepts: "numeric" },
    { id: "y", label: "Variable Y", accepts: "numeric" },
  ],
  run: (ds, picks): AnalysisResult => {
    const xv = getVar(ds, picks.x);
    const yv = getVar(ds, picks.y);
    const { x, y } = pairedNumeric(ds, picks.x, picks.y);
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    const r = sxy / Math.sqrt(sxx * syy);
    const df = n - 2;
    const t = r * Math.sqrt(df / (1 - r * r));
    const p = tTwoTailedP(t, df);
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    const strength = describeR(Math.abs(r));
    return {
      pValue: p,
      description:
        `There is a ${strength} ${r >= 0 ? "positive" : "negative"} linear correlation between ` +
        `${xv.label} and ${yv.label} (n = ${n}): r = ${fmt(r)}, r² = ${fmt(r * r)}. ` +
        `This is ${significanceNote(p)}, t(${df}) = ${fmt(t)}, p ${fmtPInline(p)}.`,
      tables: [
        {
          title: "Pearson correlation",
          columns: ["r", "r²", "n", "t", "df", "p"],
          rows: [[fmt(r), fmt(r * r), n, fmt(t), df, fmtP(p)]],
        },
      ],
      plot: {
        kind: "scatter",
        title: `${yv.label} vs ${xv.label}`,
        xLabel: xv.label,
        yLabel: yv.label,
        points: x.map((xi, i) => ({ x: xi, y: y[i] })),
        line: { slope, intercept },
      },
    };
  },
};

// ---------- Simple linear regression ----------
const regression: TestDefinition = {
  id: "regression",
  name: "Linear regression",
  blurb: "Predict a numeric outcome from one numeric predictor.",
  methods: "Simple linear regression was used to model the relationship between a continuous predictor and a continuous outcome. R² was reported as a measure of explained variance.",
  inputs: [
    { id: "outcome", label: "Outcome (Y)", accepts: "numeric" },
    { id: "predictor", label: "Predictor (X)", accepts: "numeric" },
  ],
  run: (ds, picks): AnalysisResult => {
    const yv = getVar(ds, picks.outcome);
    const xv = getVar(ds, picks.predictor);
    const { x, y } = pairedNumeric(ds, picks.predictor, picks.outcome);
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      sxy += (x[i] - mx) * (y[i] - my);
      sxx += (x[i] - mx) ** 2;
      syy += (y[i] - my) ** 2;
    }
    const slope = sxy / sxx;
    const intercept = my - slope * mx;
    let ssRes = 0;
    for (let i = 0; i < n; i++) {
      const pred = intercept + slope * x[i];
      ssRes += (y[i] - pred) ** 2;
    }
    const ssTot = syy;
    const r2 = 1 - ssRes / ssTot;
    const dfRes = n - 2;
    const mse = ssRes / dfRes;
    const seSlope = Math.sqrt(mse / sxx);
    const tSlope = slope / seSlope;
    const pSlope = tTwoTailedP(tSlope, dfRes);
    const F = (r2 / 1) / ((1 - r2) / dfRes);
    const pModel = fUpperP(F, 1, dfRes);
    const tcrit = tQuantile(0.975, dfRes);
    return {
      pValue: pSlope,
      description:
        `Simple linear regression predicting ${yv.label} from ${xv.label} (n = ${n}). ` +
        `The fitted model is ${yv.label} = ${fmt(intercept)} + ${fmt(slope)} × ${xv.label}. ` +
        `Each one-unit increase in ${xv.label} is associated with a change of ${fmt(slope)} in ` +
        `${yv.label} (${significanceNote(pSlope)}, p ${fmtPInline(pSlope)}). ` +
        `The model explains ${fmt(100 * r2, 1)}% of the variance (R² = ${fmt(r2)}).`,
      tables: [
        {
          title: "Coefficients",
          columns: ["Term", "Estimate", "Std. error", "t", "p", "95% CI"],
          rows: [
            ["(Intercept)", fmt(intercept), "", "", "", ""],
            [
              xv.label,
              fmt(slope),
              fmt(seSlope),
              fmt(tSlope),
              fmtP(pSlope),
              `${fmt(slope - tcrit * seSlope)} to ${fmt(slope + tcrit * seSlope)}`,
            ],
          ],
        },
        {
          title: "Model fit",
          columns: ["R²", "F", "df1", "df2", "p"],
          rows: [[fmt(r2), fmt(F), 1, dfRes, fmtP(pModel)]],
        },
      ],
      plot: {
        kind: "scatter",
        title: `${yv.label} vs ${xv.label}`,
        xLabel: xv.label,
        yLabel: yv.label,
        points: x.map((xi, i) => ({ x: xi, y: y[i] })),
        line: { slope, intercept },
      },
    };
  },
};

// ---------- Mann–Whitney U (nonparametric, 2 groups) ----------
const mannWhitney: TestDefinition = {
  id: "mannwhitney",
  name: "Mann–Whitney U",
  blurb: "Nonparametric comparison of a numeric variable between two groups.",
  methods: "Mann–Whitney U tests were used as nonparametric alternatives for comparing distributions between two independent groups when normality assumptions could not be assumed.",
  inputs: [
    { id: "outcome", label: "Numeric outcome", accepts: "numeric" },
    { id: "group", label: "Grouping variable (2 groups)", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length !== 2) throw new Error("Mann–Whitney U needs exactly 2 groups.");
    const [a, b] = groups;
    const combined = [
      ...a.values.map((v) => ({ v, g: 0 })),
      ...b.values.map((v) => ({ v, g: 1 })),
    ].sort((p, q) => p.v - q.v);
    // Assign ranks with ties averaged.
    const ranks = new Array(combined.length);
    let i = 0;
    while (i < combined.length) {
      let j = i;
      while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j++;
      const avg = (i + j + 2) / 2; // ranks are 1-based
      for (let k = i; k <= j; k++) ranks[k] = avg;
      i = j + 1;
    }
    let rankSumA = 0;
    for (let k = 0; k < combined.length; k++) if (combined[k].g === 0) rankSumA += ranks[k];
    const na = a.values.length;
    const nb = b.values.length;
    const uA = rankSumA - (na * (na + 1)) / 2;
    const uB = na * nb - uA;
    const U = Math.min(uA, uB);
    const muU = (na * nb) / 2;
    const sigmaU = Math.sqrt((na * nb * (na + nb + 1)) / 12);
    const z = (U - muU) / sigmaU;
    const p = zTwoTailedP(z);
    return {
      pValue: p,
      description:
        `A Mann–Whitney U test compared ${outVar.label} between ${grpVar.label} = "${a.label}" ` +
        `(n = ${na}, median = ${fmt(median(a.values))}) and "${b.label}" ` +
        `(n = ${nb}, median = ${fmt(median(b.values))}). The difference was ${significanceNote(p)}, ` +
        `U = ${fmt(U)}, z = ${fmt(z)}, p ${fmtPInline(p)} (normal approximation).`,
      tables: [
        {
          title: "Ranks",
          columns: ["Group", "N", "Median", "Mean rank"],
          rows: [
            [a.label, na, fmt(median(a.values)), fmt(rankSumA / na)],
            [b.label, nb, fmt(median(b.values)), fmt((((na + nb) * (na + nb + 1)) / 2 - rankSumA) / nb)],
          ],
        },
        {
          title: "Test statistics",
          columns: ["U", "z", "p"],
          rows: [[fmt(U), fmt(z), fmtP(p)]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `${outVar.label} by ${grpVar.label}`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

function describeR(absR: number): string {
  if (absR < 0.1) return "negligible";
  if (absR < 0.3) return "weak";
  if (absR < 0.5) return "moderate";
  if (absR < 0.7) return "strong";
  return "very strong";
}

function fmtPInline(p: number): string {
  return p < 0.001 ? "< .001" : "= " + fmtP(p);
}

// ---------- Table 1 (custom UI, run is never called) ----------
const table1Stub: TestDefinition = {
  id: "table1",
  name: "Table 1 summary",
  blurb: "Baseline characteristics table stratified by a grouping variable, or overall.",
  inputs: [],
  run: () => {
    throw new Error("Table 1 is rendered standalone — run() should never be called.");
  },
};

export const TESTS: TestDefinition[] = [
  table1Stub,
  descriptives,
  frequencies,
  tTest,
  anova,
  chiSquare,
  correlation,
  regression,
  mannWhitney,
];

export function getTest(id: string): TestDefinition {
  const t = TESTS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown test: ${id}`);
  return t;
}
