import type { AnalysisResult, AssumptionCheck, Dataset, TestDefinition } from "../types";
import {
  chiSquareUpperP,
  fisherExact2x2,
  fUpperP,
  normalQuantile,
  tTwoTailedP,
  tQuantile,
  zTwoTailedP,
} from "./distributions";
import { equalVarianceCheck, normalityCheck } from "./assumptions";
import { fmt, fmtP, fmtPct, ltPlural, significanceNote } from "./format";
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
  name: "Aprašomoji statistika",
  blurb: "Apibendrina vieną kiekybinį kintamąjį: vidurkis, SN, mediana, kvartiliai, kitimo ribos.",
  methods: "Kiekybiniams kintamiesiems apskaičiuota aprašomoji statistika: vidurkiai, standartiniai nuokrypiai, medianos ir tarpkvartiliniai plotai (IQR).",
  guide: {
    title: "Kaip patikrinti tolydžius duomenis?",
    url: "https://statistikas.lt/posts/kaip-patikrinti-tolydzius-duomenis/kaip-patikrinti-tolydzius-duomenis.html",
  },
  inputs: [{ id: "var", label: "Kintamasis", accepts: "numeric" }],
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
        `${v.label}: ${x.length} netrūkstamų reikšmių. ` +
        `Vidurkis – ${fmt(m)}${v.unit ? " " + v.unit : ""} (SN = ${fmt(s)}), ` +
        `mediana – ${fmt(med)} (IQR ${fmt(q1)}–${fmt(q3)}). ` +
        `Reikšmės kinta nuo ${fmt(min)} iki ${fmt(max)}.`,
      tables: [
        {
          title: `Aprašomoji statistika: ${v.label}`,
          columns: ["Statistika", "Reikšmė"],
          rows: [
            ["N", x.length],
            ["Vidurkis", fmt(m)],
            ["Standartinis nuokrypis (SN)", fmt(s)],
            ["Minimumas", fmt(min)],
            ["25-asis procentilis", fmt(q1)],
            ["Mediana", fmt(med)],
            ["75-asis procentilis", fmt(q3)],
            ["Maksimumas", fmt(max)],
          ],
        },
      ],
      plot: { kind: "histogram", title: `Kintamojo „${v.label}“ pasiskirstymas`, values: x, xLabel: v.label },
    };
  },
};

// ---------- Frequency table (one categorical) ----------
const frequencies: TestDefinition = {
  id: "frequencies",
  name: "Dažnių lentelė",
  blurb: "Vieno kategorinio kintamojo kategorijų dažniai ir procentai.",
  methods: "Kategoriniams kintamiesiems apskaičiuoti dažnių skirstiniai (dažniai ir procentai).",
  inputs: [{ id: "var", label: "Kintamasis", accepts: "categorical" }],
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
        `${v.label}: ${entries.length} ${ltPlural(entries.length, ["kategorija", "kategorijos", "kategorijų"])}, ` +
        `iš viso ${total} ${ltPlural(total, ["stebėjimas", "stebėjimai", "stebėjimų"])}. ` +
        `Dažniausia kategorija – „${levelLabel(v, top[0])}“ (${top[1]}; ` +
        `${fmtPct((100 * top[1]) / total, 1)}).`,
      tables: [
        {
          title: `Dažnių lentelė: ${v.label}`,
          columns: ["Kategorija", "Dažnis", "Procentai"],
          rows: entries.map(([k, c]) => [levelLabel(v, k), c, fmtPct((100 * c) / total, 1)]),
        },
      ],
      plot: {
        kind: "bar",
        title: `Kintamojo „${v.label}“ dažniai`,
        xLabel: v.label,
        yLabel: "Dažnis",
        series: [
          { label: "Dažnis", values: entries.map(([k, c]) => ({ x: levelLabel(v, k), y: c })) },
        ],
      },
    };
  },
};

// ---------- Independent-samples t-test (Welch) ----------
const tTest: TestDefinition = {
  id: "ttest",
  name: "Nepriklausomų imčių t testas",
  blurb: "Palygina kiekybinio kintamojo vidurkį tarp dviejų grupių (Welch'o t testas).",
  methods: "Dviejų nepriklausomų grupių vidurkiams palyginti taikytas nepriklausomų imčių t testas su Welch'o pataisa nelygioms dispersijoms; efekto dydžiui įvertinti apskaičiuotas Coheno d.",
  guide: {
    title: "Kada rinktis t testą?",
    url: "https://statistikas.lt/posts/kada-rinktis-t-testa/kada-rinktis-t-testa.html",
  },
  inputs: [
    { id: "outcome", label: "Kiekybinis priklausomas kintamasis", accepts: "numeric" },
    { id: "group", label: "Grupavimo kintamasis (2 grupės)", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length !== 2) {
      throw new Error(
        `Nepriklausomų imčių t testui reikia lygiai 2 grupių, o kintamasis „${grpVar.label}“ turi ${groups.length}. Trims ar daugiau grupių naudokite ANOVA.`
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
    const switchMW = {
      testId: "mannwhitney",
      picks: { outcome: picks.outcome, group: picks.group },
      label: "Pereiti prie Mann–Whitney U testo",
    };
    return {
      pValue: p,
      assumptions: [
        normalityCheck(`Normalumas (grupė „${a.label}“)`, a.values, switchMW),
        normalityCheck(`Normalumas (grupė „${b.label}“)`, b.values, switchMW),
        {
          label: "Dispersijų lygybė",
          status: "pass",
          detail: "Nereikalaujama: taikoma Welch'o pataisa, todėl nelygios dispersijos jau įvertintos.",
        },
      ],
      description:
        `Nepriklausomų imčių (Welch'o) t testu palygintas kintamasis „${outVar.label}“ pagal grupavimo kintamąjį „${grpVar.label}“. ` +
        `Grupė „${a.label}“: vidurkis ${fmt(ma)} (SN = ${fmt(sd(a.values))}; n = ${na}); ` +
        `grupė „${b.label}“: vidurkis ${fmt(mb)} (SN = ${fmt(sd(b.values))}; n = ${nb}). ` +
        `Vidurkių skirtumas ${fmt(diff)} (95 % PI [${fmt(ciLo)}; ${fmt(ciHi)}]) yra ` +
        `${significanceNote(p)}: t(${fmt(df, 1)}) = ${fmt(t)}; p ${fmtPInline(p)}; Coheno d = ${fmt(d)}.`,
      tables: [
        {
          title: "Grupių statistika",
          columns: ["Grupė", "N", "Vidurkis", "Standartinis nuokrypis (SN)"],
          rows: [
            [a.label, na, fmt(ma), fmt(sd(a.values))],
            [b.label, nb, fmt(mb), fmt(sd(b.values))],
          ],
        },
        {
          title: "Nepriklausomų imčių testas (Welch'o)",
          columns: ["t", "lls", "p", "Vidurkių skirtumas", "95 % PI", "Coheno d"],
          rows: [[fmt(t), fmt(df, 1), fmtP(p), fmt(diff), `[${fmt(ciLo)}; ${fmt(ciHi)}]`, fmt(d)]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `Kintamasis „${outVar.label}“ pagal „${grpVar.label}“`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

// ---------- One-way ANOVA ----------
const anova: TestDefinition = {
  id: "anova",
  name: "Vienfaktorė dispersinė analizė (ANOVA)",
  blurb: "Palygina kiekybinio kintamojo vidurkį tarp trijų ar daugiau grupių.",
  methods: "Grupių vidurkiams palyginti taikyta vienfaktorė dispersinė analizė (ANOVA); efekto dydžiui įvertinti pateiktas eta kvadratas (η²).",
  guide: {
    title: "Kada rinktis ANOVA?",
    url: "https://statistikas.lt/posts/kada-rinktis-anova/kada-rinktis-anova.html",
  },
  inputs: [
    { id: "outcome", label: "Kiekybinis priklausomas kintamasis", accepts: "numeric" },
    { id: "group", label: "Grupavimo kintamasis", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length < 2) throw new Error("ANOVA reikia bent 2 grupių.");
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
    const anovaChecks: AssumptionCheck[] = groups.map((g) =>
      normalityCheck(`Normalumas (grupė „${g.label}“)`, g.values)
    );
    const varCheck = equalVarianceCheck(groups);
    if (varCheck) anovaChecks.push(varCheck);
    return {
      pValue: p,
      assumptions: anovaChecks,
      description:
        `Vienfaktore dispersine analize (ANOVA) tirta, ar kintamojo „${outVar.label}“ vidurkis skiriasi tarp ` +
        `${k} grupavimo kintamojo „${grpVar.label}“ grupių. Skirtumas yra ${significanceNote(p)}: ` +
        `F(${dfBetween}; ${dfWithin}) = ${fmt(F)}; p ${fmtPInline(p)}; η² = ${fmt(etaSq)}.`,
      tables: [
        {
          title: "Grupių vidurkiai",
          columns: ["Grupė", "N", "Vidurkis", "Standartinis nuokrypis (SN)"],
          rows: groups.map((g) => [g.label, g.values.length, fmt(mean(g.values)), fmt(sd(g.values))]),
        },
        {
          title: "Dispersinė analizė (ANOVA)",
          columns: ["Šaltinis", "Kvadratų suma", "lls", "Vidutinis kvadratas", "F", "p"],
          rows: [
            ["Tarp grupių", fmt(ssBetween), dfBetween, fmt(msBetween), fmt(F), fmtP(p)],
            ["Grupių viduje", fmt(ssWithin), dfWithin, fmt(msWithin), "", ""],
            ["Iš viso", fmt(ssBetween + ssWithin), N - 1, "", "", ""],
          ],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `Kintamasis „${outVar.label}“ pagal „${grpVar.label}“`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

// ---------- Chi-square test of independence ----------
const chiSquare: TestDefinition = {
  id: "chisq",
  name: "Chi kvadrato (χ²) testas",
  blurb: "Tikrina, ar du kategoriniai kintamieji yra susiję.",
  methods: "Ryšiui tarp kategorinių kintamųjų vertinti taikytas chi kvadrato (χ²) nepriklausomumo testas; kai tikėtini dažniai buvo per maži, pateiktas Fisherio tikslusis testas. Ryšio stiprumui įvertinti apskaičiuotas Cramér'o V.",
  guide: {
    title: "Kaip atlikti chi kvadrato testą?",
    url: "https://statistikas.lt/posts/kaip-atlikti-chi-kvadrato-testa/kaip-atlikti-chi-kvadrato-testa.html",
  },
  inputs: [
    { id: "rowVar", label: "Eilučių kintamasis", accepts: "categorical" },
    { id: "colVar", label: "Stulpelių kintamasis", accepts: "categorical" },
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
    let minE = Infinity;
    let nSmallE = 0;
    let nCells = 0;
    for (const r of rows)
      for (const c of cols) {
        const o = cell.get(`${r}|${c}`) ?? 0;
        const e = (rowTot.get(r)! * colTot.get(c)!) / n;
        if (e > 0) chi2 += (o - e) ** 2 / e;
        nCells++;
        if (e < minE) minE = e;
        if (e < 5) nSmallE++;
      }
    const df = (rows.length - 1) * (cols.length - 1);
    const p = chiSquareUpperP(chi2, df);

    // Expected-count assumption; for sparse 2×2 tables fall back to Fisher's exact test.
    const assumptions: AssumptionCheck[] = [];
    const extraTables: { title: string; columns: string[]; rows: (string | number)[][] }[] = [];
    if (nSmallE === 0) {
      assumptions.push({
        label: "Tikėtini dažniai langeliuose",
        status: "pass",
        detail: `Visi tikėtini dažniai ≥ 5 (minimalus ${fmt(minE, 1)}), todėl χ² aproksimacija tinkama.`,
      });
    } else if (rows.length === 2 && cols.length === 2) {
      const [r0, r1] = rows;
      const [c0, c1] = cols;
      const fisherP = fisherExact2x2(
        cell.get(`${r0}|${c0}`) ?? 0,
        cell.get(`${r0}|${c1}`) ?? 0,
        cell.get(`${r1}|${c0}`) ?? 0,
        cell.get(`${r1}|${c1}`) ?? 0
      );
      assumptions.push({
        label: "Tikėtini dažniai langeliuose",
        status: "warn",
        detail:
          `${nSmallE} iš ${nCells} tikėtinų dažnių mažesni nei 5 (minimalus ${fmt(minE, 1)}), todėl χ² aproksimacija nepatikima. ` +
          `Fisherio tikslusis testas duoda p ${fmtPInline(fisherP)} – pateikite būtent jį.`,
      });
      extraTables.push({
        title: "Fisherio tikslusis testas",
        columns: ["p (dvipusis)"],
        rows: [[fmtP(fisherP)]],
      });
    } else {
      assumptions.push({
        label: "Tikėtini dažniai langeliuose",
        status: "warn",
        detail:
          `${nSmallE} iš ${nCells} tikėtinų dažnių mažesni nei 5 (minimalus ${fmt(minE, 1)}), todėl χ² aproksimacija nepatikima. ` +
          `Apsvarstykite retų kategorijų sujungimą kintamųjų redaktoriuje.`,
      });
    }
    const cramersV = Math.sqrt(chi2 / (n * Math.min(rows.length - 1, cols.length - 1)));
    const contingencyCols = ["", ...cols.map((c) => levelLabel(cv, c)), "Iš viso"];
    const contingencyRows = rows.map((r) => [
      levelLabel(rv, r),
      ...cols.map((c) => cell.get(`${r}|${c}`) ?? 0),
      rowTot.get(r)!,
    ]);
    contingencyRows.push(["Iš viso",...cols.map((c) => colTot.get(c)!), n]);
    return {
      pValue: p,
      assumptions,
      description:
        `Chi kvadrato (χ²) nepriklausomumo testu tirtas ryšys tarp kintamųjų „${rv.label}“ ir ` +
        `„${cv.label}“ (N = ${n}). Ryšys yra ${significanceNote(p)}: ` +
        `χ²(${df}) = ${fmt(chi2)}; p ${fmtPInline(p)}; Cramér'o V = ${fmt(cramersV)}.`,
      tables: [
        { title: `Kryžminė lentelė: ${rv.label} × ${cv.label}`, columns: contingencyCols, rows: contingencyRows },
        {
          title: "Chi kvadrato (χ²) testas",
          columns: ["χ²", "lls", "p", "Cramér'o V", "N"],
          rows: [[fmt(chi2), df, fmtP(p), fmt(cramersV), n]],
        },
        ...extraTables,
      ],
      plot: {
        kind: "bar",
        title: `Kintamasis „${rv.label}“ pagal „${cv.label}“`,
        xLabel: rv.label,
        yLabel: "Dažnis",
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
  name: "Pirsono koreliacija",
  blurb: "Įvertina tiesinį ryšį tarp dviejų kiekybinių kintamųjų.",
  methods: "Tiesiniam ryšiui tarp kiekybinių kintamųjų įvertinti apskaičiuoti Pirsono koreliacijos koeficientai.",
  inputs: [
    { id: "x", label: "Kintamasis X", accepts: "numeric" },
    { id: "y", label: "Kintamasis Y", accepts: "numeric" },
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
      assumptions: [
        normalityCheck(`Normalumas („${xv.label}“)`, x),
        normalityCheck(`Normalumas („${yv.label}“)`, y),
        {
          label: "Tiesiškumas ir išskirtys",
          status: "pass",
          detail: "Pirsono r fiksuoja tik tiesinį ryšį ir yra jautrus išskirtims – žemiau esančioje sklaidos diagramoje patikrinkite, ar nėra kreivumo ar kraštutinių taškų.",
        },
      ],
      description:
        `Tarp kintamųjų „${xv.label}“ ir „${yv.label}“ (n = ${n}) stebima ${strength} ${r >= 0 ? "teigiama" : "neigiama"} tiesinė koreliacija: ` +
        `r = ${fmt(r)}; r² = ${fmt(r * r)}. ` +
        `Ryšys yra ${significanceNote(p)}: t(${df}) = ${fmt(t)}; p ${fmtPInline(p)}.`,
      tables: [
        {
          title: "Pirsono koreliacija",
          columns: ["r", "r²", "n", "t", "lls", "p"],
          rows: [[fmt(r), fmt(r * r), n, fmt(t), df, fmtP(p)]],
        },
      ],
      plot: {
        kind: "scatter",
        title: `Kintamojo „${yv.label}“ priklausomybė nuo „${xv.label}“`,
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
  name: "Tiesinė regresija",
  blurb: "Prognozuoja kiekybinį priklausomą kintamąjį pagal vieną kiekybinį nepriklausomą kintamąjį.",
  methods: "Ryšiui tarp kiekybinio nepriklausomo ir kiekybinio priklausomo kintamųjų modeliuoti taikyta tiesinė regresija; paaiškintai dispersijos daliai įvertinti pateiktas determinacijos koeficientas R².",
  inputs: [
    { id: "outcome", label: "Priklausomas kintamasis (Y)", accepts: "numeric" },
    { id: "predictor", label: "Nepriklausomas kintamasis (X)", accepts: "numeric" },
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
    const resid: number[] = [];
    for (let i = 0; i < n; i++) {
      const pred = intercept + slope * x[i];
      resid.push(y[i] - pred);
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
      assumptions: [
        normalityCheck("Liekanų normalumas", resid),
        {
          label: "Tiesiškumas",
          status: "pass",
          detail: "Modelis daro prielaidą, kad ryšys tiesinis – žemiau esančioje sklaidos diagramoje patikrinkite, ar nėra kreivumo.",
        },
      ],
      description:
        `Tiesinė regresija: priklausomas kintamasis – „${yv.label}“, nepriklausomas – „${xv.label}“ (n = ${n}). ` +
        `Sudarytas modelis: ${yv.label} = ${fmt(intercept)} + ${fmt(slope)} × ${xv.label}. ` +
        `Kintamajam „${xv.label}“ padidėjus vienu vienetu, „${yv.label}“ vidutiniškai pakinta ${fmt(slope)} ` +
        `(${significanceNote(pSlope)}; p ${fmtPInline(pSlope)}). ` +
        `Modelis paaiškina ${fmtPct(100 * r2, 1)} dispersijos (R² = ${fmt(r2)}).`,
      tables: [
        {
          title: "Koeficientai",
          columns: ["Narys", "Įvertis", "Standartinė paklaida (SP)", "t", "p", "95 % PI"],
          rows: [
            ["Laisvasis narys", fmt(intercept), "", "", "", ""],
            [
              xv.label,
              fmt(slope),
              fmt(seSlope),
              fmt(tSlope),
              fmtP(pSlope),
              `[${fmt(slope - tcrit * seSlope)}; ${fmt(slope + tcrit * seSlope)}]`,
            ],
          ],
        },
        {
          title: "Modelio tinkamumas",
          columns: ["R²", "F", "lls₁", "lls₂", "p"],
          rows: [[fmt(r2), fmt(F), 1, dfRes, fmtP(pModel)]],
        },
      ],
      plot: {
        kind: "scatter",
        title: `Kintamojo „${yv.label}“ priklausomybė nuo „${xv.label}“`,
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
  name: "Mann–Whitney U testas",
  blurb: "Neparametrinis kiekybinio kintamojo palyginimas tarp dviejų grupių.",
  methods: "Dviejų nepriklausomų grupių pasiskirstymams palyginti, kai negalima daryti normalumo prielaidos, taikytas neparametrinis Mann–Whitney U testas (p reikšmė gauta pagal normaliąją aproksimaciją).",
  guide: {
    title: "Kada rinktis Mann–Whitney testą?",
    url: "https://statistikas.lt/posts/kada-rinktis-mann-whitney/kada-rinktis-mann-whitney.html",
  },
  inputs: [
    { id: "outcome", label: "Kiekybinis priklausomas kintamasis", accepts: "numeric" },
    { id: "group", label: "Grupavimo kintamasis (2 grupės)", accepts: "categorical" },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const grpVar = getVar(ds, picks.group);
    const groups = groupNumeric(ds, picks.outcome, picks.group);
    if (groups.length !== 2) throw new Error("Mann–Whitney U testui reikia lygiai 2 grupių.");
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
      assumptions: [
        na < 5 || nb < 5
          ? {
              label: "Imties dydis",
              status: "warn",
              detail: `Labai maža grupė (n = ${Math.min(na, nb)}) – p reikšmei apskaičiuoti naudojama normalioji aproksimacija gali būti netiksli, kai grupėje yra mažiau nei ≈ 5 stebėjimai.`,
            }
          : {
              label: "Nereikalaujama normalumo",
              status: "pass",
              detail: "Mann–Whitney U testas nereikalauja normalumo prielaidos; jis lygina visus pasiskirstymus pagal rangus.",
            },
      ],
      description:
        `Mann–Whitney U testu palygintas kintamasis „${outVar.label}“ pagal grupavimo kintamąjį „${grpVar.label}“: ` +
        `grupė „${a.label}“ (n = ${na}; mediana ${fmt(median(a.values))}) ir ` +
        `grupė „${b.label}“ (n = ${nb}; mediana ${fmt(median(b.values))}). Skirtumas yra ${significanceNote(p)}: ` +
        `U = ${fmt(U)}; z = ${fmt(z)}; p ${fmtPInline(p)} (normalioji aproksimacija).`,
      tables: [
        {
          title: "Rangai",
          columns: ["Grupė", "N", "Mediana", "Vidutinis rangas"],
          rows: [
            [a.label, na, fmt(median(a.values)), fmt(rankSumA / na)],
            [b.label, nb, fmt(median(b.values)), fmt((((na + nb) * (na + nb + 1)) / 2 - rankSumA) / nb)],
          ],
        },
        {
          title: "Testo statistikos",
          columns: ["U", "z", "p"],
          rows: [[fmt(U), fmt(z), fmtP(p)]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `Kintamasis „${outVar.label}“ pagal „${grpVar.label}“`,
        yLabel: outVar.label,
        groups: groups.map((g) => ({ label: g.label, values: g.values })),
      },
    };
  },
};

function describeR(absR: number): string {
  // Feminine nominative singular: agrees with "koreliacija".
  if (absR < 0.1) return "nereikšminga";
  if (absR < 0.3) return "silpna";
  if (absR < 0.5) return "vidutinė";
  if (absR < 0.7) return "stipri";
  return "labai stipri";
}

/** "= 0,034" or "< 0,001" — meant to follow a literal "p ". */
function fmtPInline(p: number): string {
  return p < 0.001 ? fmtP(p) : "= " + fmtP(p);
}

// ---------- Multiple linear regression ----------

/** Gauss-Jordan elimination (partial pivot). Solves Ax = b in-place on copies. */
function gaussSolve(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    }
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-14)
      throw new Error("Singuliarioji matrica – nepriklausomi kintamieji gali būti idealiai kolinearūs.");
    const pivot = M[col][col];
    for (let j = col; j <= n; j++) M[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row[n]);
}

function computeOLS(xCols: number[][], y: number[]) {
  const n = y.length;
  const k = xCols.length;
  const p = k + 1;
  const rows = Array.from({ length: n }, (_, i) => [1, ...xCols.map((c) => c[i])]);
  const XtX: number[][] = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => rows.reduce((s, r) => s + r[i] * r[j], 0))
  );
  const Xty = Array.from({ length: p }, (_, i) =>
    rows.reduce((s, r, ri) => s + r[i] * y[ri], 0)
  );
  const beta = gaussSolve(XtX.map((r) => [...r]), Xty);
  const yHat = rows.map((r) => r.reduce((s, v, j) => s + v * beta[j], 0));
  const resid = y.map((yi, i) => yi - yHat[i]);
  const yMean = mean(y);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const ssRes = resid.reduce((s, e) => s + e * e, 0);
  const ssModel = ssTot - ssRes;
  const dfRes = n - p;
  const mse = ssRes / dfRes;
  const r2 = ssModel / ssTot;
  const adjR2 = 1 - (ssRes / dfRes) / (ssTot / (n - 1));
  const F = (ssModel / k) / mse;
  const pModel = fUpperP(F, k, dfRes);
  const tcrit = tQuantile(0.975, dfRes);
  const se: number[] = [];
  const tStat: number[] = [];
  const pVal: number[] = [];
  const ci: [number, number][] = [];
  for (let j = 0; j < p; j++) {
    const ej = Array(p).fill(0);
    ej[j] = 1;
    const inv_j = gaussSolve(XtX.map((r) => [...r]), ej);
    const sej = Math.sqrt(mse * inv_j[j]);
    const tj = beta[j] / sej;
    se.push(sej);
    tStat.push(tj);
    pVal.push(tTwoTailedP(tj, dfRes));
    ci.push([beta[j] - tcrit * sej, beta[j] + tcrit * sej]);
  }
  return { beta, se, tStat, pVal, ci, r2, adjR2, F, k, dfRes, pModel, ssModel, ssRes, ssTot, yHat };
}

const multipleRegression: TestDefinition = {
  id: "multiple_regression",
  name: "Daugialypė tiesinė regresija",
  blurb: "Prognozuoja kiekybinį priklausomą kintamąjį pagal du ar daugiau kiekybinių nepriklausomų kintamųjų.",
  methods:
    "Ryšiui tarp nepriklausomų kintamųjų ir kiekybinio priklausomo kintamojo modeliuoti taikyta daugialypė tiesinė regresija, parametrai vertinti mažiausiųjų kvadratų metodu; paaiškintai dispersijos daliai įvertinti pateikti determinacijos koeficientas R² ir pakoreguotas R².",
  inputs: [
    { id: "outcome", label: "Priklausomas kintamasis (Y)", accepts: "numeric" },
    { id: "predictors", label: "Nepriklausomi kintamieji (X)", accepts: "numeric", multi: true },
  ],
  run: (ds, picks): AnalysisResult => {
    const yv = getVar(ds, picks.outcome);
    const predKeys = (picks.predictors ?? "").split(",").filter(Boolean);
    if (predKeys.length < 1) throw new Error("Pasirinkite bent vieną nepriklausomą kintamąjį.");
    const predVars = predKeys.map((k) => getVar(ds, k));

    const yArr: number[] = [];
    const xCols: number[][] = predKeys.map(() => []);
    for (const row of ds.rows) {
      const yv2 = row[picks.outcome];
      if (yv2 == null || yv2 === "") continue;
      const yn = typeof yv2 === "number" ? yv2 : Number(yv2);
      if (isNaN(yn)) continue;
      let ok = true;
      const xVals: number[] = [];
      for (const pk of predKeys) {
        const xv2 = row[pk];
        if (xv2 == null || xv2 === "") { ok = false; break; }
        const xn = typeof xv2 === "number" ? xv2 : Number(xv2);
        if (isNaN(xn)) { ok = false; break; }
        xVals.push(xn);
      }
      if (!ok) continue;
      yArr.push(yn);
      xVals.forEach((v, i) => xCols[i].push(v));
    }

    const n = yArr.length;
    if (n <= predKeys.length + 1)
      throw new Error(`Reikia bent ${predKeys.length + 2} pilnų stebėjimų (turima: ${n}).`);

    const ols = computeOLS(xCols, yArr);

    const coefRows: (string | number)[][] = [
      ["Laisvasis narys", fmt(ols.beta[0]), fmt(ols.se[0]), fmt(ols.tStat[0]), fmtP(ols.pVal[0]),
        `[${fmt(ols.ci[0][0])}; ${fmt(ols.ci[0][1])}]`],
    ];
    predVars.forEach((pv, i) => {
      coefRows.push([
        pv.label,
        fmt(ols.beta[i + 1]),
        fmt(ols.se[i + 1]),
        fmt(ols.tStat[i + 1]),
        fmtP(ols.pVal[i + 1]),
        `[${fmt(ols.ci[i + 1][0])}; ${fmt(ols.ci[i + 1][1])}]`,
      ]);
    });

    const sigPreds = predVars.filter((_, i) => ols.pVal[i + 1] < 0.05);
    const sigText =
      sigPreds.length > 0
        ? `Statistiškai reikšmingi nepriklausomi kintamieji (p < 0,05): ${sigPreds.map((v) => v.label).join("; ")}.`
        : "Nė vienas nepriklausomas kintamasis atskirai nebuvo statistiškai reikšmingas (α = 0,05).";

    const residuals = yArr.map((yi, i) => yi - ols.yHat[i]);
    return {
      pValue: ols.pModel,
      assumptions: [
        normalityCheck("Liekanų normalumas", residuals),
        {
          label: "Tiesiškumas",
          status: "pass",
          detail: "Modelis daro prielaidą, kad ryšiai tiesiniai – žemiau esančioje prognozuotų ir stebėtų reikšmių diagramoje patikrinkite, ar nėra sisteminio kreivumo.",
        },
      ],
      description:
        `Daugialypė tiesinė regresija: priklausomas kintamasis – „${yv.label}“; ` +
        `nepriklausomų kintamųjų skaičius – ${predVars.length} (n = ${n}). ` +
        `Modelis yra ${significanceNote(ols.pModel)}: ` +
        `F(${ols.k}; ${ols.dfRes}) = ${fmt(ols.F)}; p ${fmtPInline(ols.pModel)}; ` +
        `R² = ${fmt(ols.r2)}; pakoreguotas R² = ${fmt(ols.adjR2)}. ${sigText}`,
      tables: [
        {
          title: "Koeficientai",
          columns: ["Narys", "B", "Standartinė paklaida (SP)", "t", "p", "95 % PI"],
          rows: coefRows,
        },
        {
          title: "Modelio santrauka",
          columns: ["R²", "Pakoreguotas R²", "F", "lls₁", "lls₂", "p"],
          rows: [[fmt(ols.r2), fmt(ols.adjR2), fmt(ols.F), ols.k, ols.dfRes, fmtP(ols.pModel)]],
        },
        {
          title: "Dispersinė analizė (ANOVA)",
          columns: ["Šaltinis", "Kvadratų suma", "lls", "Vidutinis kvadratas", "F", "p"],
          rows: [
            ["Regresija", fmt(ols.ssModel), ols.k, fmt(ols.ssModel / ols.k), fmt(ols.F), fmtP(ols.pModel)],
            ["Liekanos", fmt(ols.ssRes), ols.dfRes, fmt(ols.ssRes / ols.dfRes), "", ""],
            ["Iš viso", fmt(ols.ssTot), ols.k + ols.dfRes, "", "", ""],
          ],
        },
      ],
      plot: {
        kind: "scatter",
        title: `Prognozuotos ir stebėtos reikšmės: ${yv.label}`,
        xLabel: `Prognozuota: ${yv.label}`,
        yLabel: `Stebėta: ${yv.label}`,
        points: ols.yHat.map((yh, i) => ({ x: yh, y: yArr[i] })),
        line: { slope: 1, intercept: 0 },
      },
    };
  },
};

// ---------- Binary logistic regression ----------

/** Maximum-likelihood logistic fit via iteratively reweighted least squares (Newton–Raphson). */
export function fitLogistic(xCols: number[][], y: number[]) {
  const n = y.length;
  const k = xCols.length;
  const p = k + 1;
  const rows = Array.from({ length: n }, (_, i) => [1, ...xCols.map((c) => c[i])]);
  let beta: number[] = new Array(p).fill(0);
  let converged = false;

  const probs = (b: number[]) =>
    rows.map((r) => 1 / (1 + Math.exp(-r.reduce((s, v, j) => s + v * b[j], 0))));
  const hessian = (mu: number[]) =>
    Array.from({ length: p }, (_, a) =>
      Array.from({ length: p }, (_, b2) =>
        rows.reduce((s, r, i) => s + r[a] * r[b2] * Math.max(mu[i] * (1 - mu[i]), 1e-10), 0)
      )
    );

  for (let iter = 0; iter < 50 && !converged; iter++) {
    const mu = probs(beta);
    const grad = Array.from({ length: p }, (_, j) =>
      rows.reduce((s, r, i) => s + r[j] * (y[i] - mu[i]), 0)
    );
    const step = gaussSolve(hessian(mu), grad);
    beta = beta.map((b, j) => b + step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-10) converged = true;
  }

  const mu = probs(beta);
  const H = hessian(mu);
  const se: number[] = [];
  for (let j = 0; j < p; j++) {
    const ej = Array(p).fill(0);
    ej[j] = 1;
    se.push(Math.sqrt(gaussSolve(H.map((r) => [...r]), ej)[j]));
  }
  const zStat = beta.map((b, j) => b / se[j]);
  const pVal = zStat.map((z) => zTwoTailedP(z));
  const zcrit = normalQuantile(0.975);
  const ci: [number, number][] = beta.map((b, j) => [b - zcrit * se[j], b + zcrit * se[j]]);

  const clip = (v: number) => Math.min(Math.max(v, 1e-12), 1 - 1e-12);
  const logLik = y.reduce((s, yi, i) => s + yi * Math.log(clip(mu[i])) + (1 - yi) * Math.log(1 - clip(mu[i])), 0);
  const pBar = mean(y);
  const llNull = n * (pBar * Math.log(clip(pBar)) + (1 - pBar) * Math.log(1 - clip(pBar)));
  const lrChi2 = 2 * (logLik - llNull);
  const pModel = chiSquareUpperP(lrChi2, k);
  const mcFadden = 1 - logLik / llNull;
  const coxSnell = 1 - Math.exp((2 / n) * (llNull - logLik));
  const nagelkerke = coxSnell / (1 - Math.exp((2 / n) * llNull));

  return { beta, se, zStat, pVal, ci, mu, logLik, llNull, lrChi2, pModel, mcFadden, nagelkerke, k, n, converged };
}

/** Encoders turning a variable into design-matrix columns (dummy coding for categoricals). */
function encodePredictors(ds: Dataset, keys: string[]) {
  const encoders: { label: string; varKey: string; get: (raw: number | string) => number }[] = [];
  for (const key of keys) {
    const v = getVar(ds, key);
    if (v.type === "numeric") {
      encoders.push({ label: v.label, varKey: key, get: (raw) => Number(raw) });
    } else {
      const levels = [...new Set(
        ds.rows
          .map((r) => r[key])
          .filter((x) => x !== null && x !== undefined && x !== "")
          .map(String)
      )].sort();
      if (levels.length < 2)
        throw new Error(`Kintamasis „${v.label}“ turi mažiau nei dvi stebėtas kategorijas.`);
      if (levels.length > 8)
        throw new Error(
          `Kintamasis „${v.label}“ turi ${levels.length} ${ltPlural(levels.length, ["kategoriją", "kategorijas", "kategorijų"])} –prieš naudodami jį kaip nepriklausomą kintamąjį, perkoduokite į mažiau grupių.`
        );
      const ref = levels[0];
      for (const lvl of levels.slice(1)) {
        encoders.push({
          label: `${v.label}: ${levelLabel(v, lvl)} (lyginant su ${levelLabel(v, ref)})`,
          varKey: key,
          get: (raw) => (String(raw) === lvl ? 1 : 0),
        });
      }
    }
  }
  return encoders;
}

const logistic: TestDefinition = {
  id: "logistic",
  name: "Logistinė regresija",
  blurb: "Prognozuoja dvireikšmį (dviejų kategorijų) priklausomą kintamąjį pagal vieną ar kelis nepriklausomus kintamuosius; pateikia šansų santykius.",
  methods:
    "Dichotominiams rezultatams modeliuoti taikyta dvinė logistinė regresija. Kiekvienam nepriklausomam kintamajam pateikti šansų santykiai (ŠS) su 95 % pasikliautinaisiais intervalais (PI); bendras modelio tinkamumas vertintas tikėtinumo santykio chi kvadrato testu, o paaiškintai variacijai įvertinti pateiktas Nagelkerke'io R².",
  inputs: [
    { id: "outcome", label: "Dvireikšmis priklausomas kintamasis", accepts: "categorical" },
    { id: "predictors", label: "Nepriklausomi kintamieji", accepts: "any", multi: true },
  ],
  run: (ds, picks): AnalysisResult => {
    const outVar = getVar(ds, picks.outcome);
    const predKeys = (picks.predictors ?? "").split(",").filter(Boolean);
    if (predKeys.length < 1) throw new Error("Pasirinkite bent vieną nepriklausomą kintamąjį.");
    if (predKeys.includes(picks.outcome))
      throw new Error("Priklausomas kintamasis negali būti ir nepriklausomu kintamuoju.");
    const missing = (x: number | string | null | undefined) =>
      x === null || x === undefined || x === "";

    const outLevels = [...new Set(
      ds.rows.map((r) => r[picks.outcome]).filter((x) => !missing(x)).map(String)
    )].sort();
    if (outLevels.length !== 2)
      throw new Error(
        `Logistinei regresijai reikia priklausomo kintamojo su 2 kategorijomis, o kintamasis „${outVar.label}“ turi ${outLevels.length}.`
      );
    const [refLevel, eventLevel] = outLevels;
    const eventLabel = levelLabel(outVar, eventLevel);
    const refLabel = levelLabel(outVar, refLevel);

    const encoders = encodePredictors(ds, predKeys);
    const y: number[] = [];
    const xCols: number[][] = encoders.map(() => []);
    for (const row of ds.rows) {
      const o = row[picks.outcome];
      if (missing(o)) continue;
      if (predKeys.some((k) => missing(row[k]))) continue;
      const xs = encoders.map((e) => e.get(row[e.varKey]!));
      if (xs.some((v) => Number.isNaN(v))) continue;
      y.push(String(o) === eventLevel ? 1 : 0);
      xs.forEach((v, i) => xCols[i].push(v));
    }
    const n = y.length;
    const events = y.reduce((s, v) => s + v, 0);
    if (events === 0 || events === n)
      throw new Error(`Visi pilni stebėjimai turi tą pačią priklausomo kintamojo reikšmę („${events === n ? eventLabel : refLabel}“) – nėra ką modeliuoti.`);
    if (n <= encoders.length + 1)
      throw new Error(`Reikia bent ${encoders.length + 2} pilnų stebėjimų (turima: ${n}).`);

    const fit = fitLogistic(xCols, y);

    const unstable = !fit.converged || fit.beta.some((b) => Math.abs(b) > 15);
    const epv = Math.min(events, n - events) / encoders.length;
    const logisticChecks: AssumptionCheck[] = [
      epv >= 10
        ? {
            label: "Įvykių skaičius vienam nepriklausomam kintamajam",
            status: "pass",
            detail: `Įvykių vienam modelio nariui: ${fmt(epv, 1)} (rekomendacija: ≥ 10) – duomenų pakanka stabiliems įverčiams.`,
          }
        : {
            label: "Įvykių skaičius vienam nepriklausomam kintamajam",
            status: "warn",
            detail: `Įvykių vienam modelio nariui: tik ${fmt(epv, 1)} (rekomendacija: ≥ 10) – šansų santykiai ir pasikliautinieji intervalai gali būti nestabilūs. Apsvarstykite mažesnį nepriklausomų kintamųjų skaičių.`,
          },
    ];
    if (unstable) {
      logisticChecks.push({
        label: "Atskyrimas (separation)",
        status: "fail",
        detail:
          "Modelis nestabilizavosi – nepriklausomas kintamasis (ar jų derinys) gali idealiai atskirti priklausomo kintamojo grupes. Paveiktų šansų santykių interpretuoti negalima.",
      });
    }
    const coefRows: (string | number)[][] = [
      ["Laisvasis narys", fmt(fit.beta[0]), fmt(fit.se[0]), fmt(fit.zStat[0]), fmtP(fit.pVal[0]), "", ""],
      ...encoders.map((e, i) => [
        e.label,
        fmt(fit.beta[i + 1]),
        fmt(fit.se[i + 1]),
        fmt(fit.zStat[i + 1]),
        fmtP(fit.pVal[i + 1]),
        fmt(Math.exp(fit.beta[i + 1])),
        `[${fmt(Math.exp(fit.ci[i + 1][0]))}; ${fmt(Math.exp(fit.ci[i + 1][1]))}]`,
      ]),
    ];

    const sigTerms = encoders
      .map((e, i) => ({ label: e.label, or: Math.exp(fit.beta[i + 1]), p: fit.pVal[i + 1] }))
      .filter((t) => t.p < 0.05);
    const sigText =
      sigTerms.length > 0
        ? `Statistiškai reikšmingi nepriklausomi kintamieji (p < 0,05): ${sigTerms
            .map((t) => `${t.label} (ŠS = ${fmt(t.or)}; ${t.or >= 1 ? "didesnis" : "mažesnis"} „${eventLabel}“ šansas)`)
            .join("; ")}.`
        : "Nė vienas nepriklausomas kintamasis atskirai nebuvo statistiškai reikšmingas (α = 0,05).";

    return {
      pValue: fit.pModel,
      assumptions: logisticChecks,
      description:
        (unstable
          ? "⚠ Modelis nestabilizavosi – nepriklausomas kintamasis gali idealiai atskirti grupes, todėl šie įverčiai nepatikimi. "
          : "") +
        `Dvine logistine regresija modeliuota tikimybė, kad kintamasis „${outVar.label}“ = „${eventLabel}“ ` +
        `(lyginant su „${refLabel}“); nepriklausomų kintamųjų skaičius – ${predKeys.length} ` +
        `(n = ${n}; įvykių = ${events}). Modelis yra ${significanceNote(fit.pModel)}: ` +
        `tikėtinumo santykio χ²(${fit.k}) = ${fmt(fit.lrChi2)}; p ${fmtPInline(fit.pModel)}; ` +
        `Nagelkerke'io R² = ${fmt(fit.nagelkerke)}. ${sigText}`,
      tables: [
        {
          title: `Koeficientai – priklausomas kintamasis: ${outVar.label} = „${eventLabel}“`,
          columns: ["Narys", "B", "Standartinė paklaida (SP)", "z", "p", "ŠS", "95 % PI (ŠS)"],
          rows: coefRows,
        },
        {
          title: "Modelio santrauka",
          columns: ["N", "Įvykiai", "−2 log. tikėtinumas", "TS χ²", "lls", "p", "McFaddeno R²", "Nagelkerke'io R²"],
          rows: [[
            n,
            events,
            fmt(-2 * fit.logLik),
            fmt(fit.lrChi2),
            fit.k,
            fmtP(fit.pModel),
            fmt(fit.mcFadden),
            fmt(fit.nagelkerke),
          ]],
        },
      ],
      plot: {
        kind: "boxplot",
        title: `Prognozuota „${eventLabel}“ tikimybė pagal stebėtą rezultatą`,
        yLabel: `Prognozuota P(${eventLabel})`,
        groups: [
          { label: `Stebėta: ${refLabel}`, values: fit.mu.filter((_, i) => y[i] === 0) },
          { label: `Stebėta: ${eventLabel}`, values: fit.mu.filter((_, i) => y[i] === 1) },
        ],
      },
    };
  },
};

// ---------- Table 1 (custom UI, run is never called) ----------
const table1Stub: TestDefinition = {
  id: "table1",
  name: "Imties charakteristikų lentelė („1 lentelė“)",
  blurb: "Imties charakteristikų lentelė, suskirstyta pagal grupavimo kintamąjį arba bendra.",
  inputs: [],
  run: () => {
    throw new Error("„1 lentelė“ atvaizduojama atskirai – run() niekada neturėtų būti kviečiama.");
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
  multipleRegression,
  logistic,
  mannWhitney,
];

export function getTest(id: string): TestDefinition {
  const t = TESTS.find((x) => x.id === id);
  if (!t) throw new Error(`Nežinomas testas: ${id}`);
  return t;
}
