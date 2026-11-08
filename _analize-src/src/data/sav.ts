import type { Dataset, Variable } from "../types";

// Minimal SPSS system-file (.sav) reader – no dependencies, works in the browser
// and in node (vitest). Reads: variable names (incl. long names), variable labels,
// value labels, user-missing values (→ null), system-missing (→ null), measurement
// level, string variables up to 255 bytes, uncompressed and bytecode-compressed data,
// and the file's character encoding. Not supported: .zsav (zlib) files and
// very long strings (> 255 bytes, which SPSS splits into several segments).

interface RawVar {
  /** Short (8-char) name from the dictionary. */
  shortName: string;
  name: string;
  /** 0 = numeric, otherwise string width in bytes. */
  width: number;
  /** Number of 8-byte slots this variable occupies in a case. */
  slots: number;
  label?: string;
  missing: { values: number[]; range?: [number, number] };
  stringMissing: string[];
  valueLabels: Map<number | string, string>;
  /** 1 = nominal, 2 = ordinal, 3 = scale, 0 = unknown. */
  measure: number;
}

class Reader {
  private view: DataView;
  pos = 0;
  constructor(private bytes: Uint8Array, public little = true) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  get remaining() {
    return this.bytes.length - this.pos;
  }
  int32(): number {
    const v = this.view.getInt32(this.pos, this.little);
    this.pos += 4;
    return v;
  }
  float64(): number {
    const v = this.view.getFloat64(this.pos, this.little);
    this.pos += 8;
    return v;
  }
  raw(n: number): Uint8Array {
    if (this.pos + n > this.bytes.length) throw new Error("Failas nutrūkęs – .sav failas nepilnas arba sugadintas.");
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  peekFloat64At(bytes: Uint8Array): number {
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getFloat64(0, this.little);
  }
  skip(n: number) {
    this.pos += n;
  }
}

/** Windows code page → WHATWG encoding label (for files without an encoding record). */
function codePageLabel(cp: number): string {
  if (cp === 65001) return "utf-8";
  if (cp >= 874 && cp <= 1258) return `windows-${cp}`;
  if (cp === 28591 || cp === 1 || cp === 2 || cp === 3) return "windows-1252";
  return "utf-8";
}

function makeDecoder(label: string): TextDecoder {
  try {
    return new TextDecoder(label.toLowerCase());
  } catch {
    return new TextDecoder("utf-8");
  }
}

export function datasetFromSav(buffer: ArrayBuffer, name = "duomenys"): Dataset {
  const bytes = new Uint8Array(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic === "$FL3")
    throw new Error("Suspausti .zsav failai nepalaikomi – SPSS programoje išsaugokite failą kaip įprastą .sav.");
  if (magic !== "$FL2") throw new Error("Tai ne SPSS .sav failas.");

  const r = new Reader(bytes);
  // Header: magic(4) product(60) layout(4) …
  r.pos = 64;
  let layout = r.int32();
  if (layout !== 2 && layout !== 3) {
    r.little = false;
    r.pos = 64;
    layout = r.int32();
    if (layout !== 2 && layout !== 3) throw new Error("Nepavyko nustatyti .sav failo baitų tvarkos.");
  }
  r.int32(); // nominal case size
  const compression = r.int32();
  if (compression === 2) throw new Error("zlib suspausti .sav failai nepalaikomi.");
  r.int32(); // weight index
  const nCasesHeader = r.int32();
  const bias = r.float64();
  r.skip(9 + 8 + 64 + 3); // date, time, file label, padding

  // Strings are kept as bytes until the encoding is known (it comes later in the dictionary).
  const vars: RawVar[] = [];
  const slotOwner: (RawVar | null)[] = []; // dictionary index (0-based slot) → variable
  const varLabelBytes = new Map<RawVar, Uint8Array>();
  const valueLabelBytes: { values: Uint8Array[]; labels: Uint8Array[]; slots: number[] }[] = [];
  const longStringLabels: { name: string; value: Uint8Array; label: Uint8Array }[] = [];
  let sysmis = -Number.MAX_VALUE;
  let encoding: string | null = null;
  let codePage = 0;
  let longNames: Uint8Array | null = null;
  let measures: number[] = [];
  const shortNameBytes = new Map<RawVar, Uint8Array>();

  for (;;) {
    const recType = r.int32();
    if (recType === 2) {
      const type = r.int32();
      const hasLabel = r.int32();
      const nMissing = r.int32();
      r.int32(); // print format
      r.int32(); // write format
      const nameBytes = r.raw(8);
      let label: Uint8Array | undefined;
      if (hasLabel === 1) {
        const len = r.int32();
        label = r.raw(len);
        r.skip((4 - (len % 4)) % 4);
      }
      const missingRaw: Uint8Array[] = [];
      for (let i = 0; i < Math.abs(nMissing); i++) missingRaw.push(r.raw(8));
      if (type === -1) {
        // Continuation slot of a preceding string variable.
        const owner = slotOwner[slotOwner.length - 1];
        if (owner) owner.slots++;
        slotOwner.push(owner);
        continue;
      }
      const v: RawVar = {
        shortName: "",
        name: "",
        width: type,
        slots: 1,
        missing: { values: [] },
        stringMissing: [],
        valueLabels: new Map(),
        measure: 0,
      };
      shortNameBytes.set(v, nameBytes);
      if (label) varLabelBytes.set(v, label);
      if (type === 0) {
        const nums = missingRaw.map((b) => r.peekFloat64At(b));
        if (nMissing === -2 || nMissing === -3) {
          v.missing.range = [nums[0], nums[1]];
          v.missing.values = nums.slice(2);
        } else v.missing.values = nums;
      } else {
        // String missing values are decoded later together with the other text.
        (v as RawVar & { _strMissing?: Uint8Array[] })._strMissing = missingRaw;
      }
      vars.push(v);
      slotOwner.push(v);
    } else if (recType === 3) {
      const count = r.int32();
      const values: Uint8Array[] = [];
      const labels: Uint8Array[] = [];
      for (let i = 0; i < count; i++) {
        values.push(r.raw(8));
        const len = r.raw(1)[0];
        labels.push(r.raw(len));
        r.skip((8 - ((len + 1) % 8)) % 8);
      }
      if (r.int32() !== 4) throw new Error("Sugadintas .sav failas (trūksta reikšmių etikečių įrašo).");
      const nVars = r.int32();
      const slots: number[] = [];
      for (let i = 0; i < nVars; i++) slots.push(r.int32() - 1);
      valueLabelBytes.push({ values, labels, slots });
    } else if (recType === 6) {
      const lines = r.int32();
      r.skip(lines * 80);
    } else if (recType === 7) {
      const subtype = r.int32();
      const size = r.int32();
      const count = r.int32();
      const start = r.pos;
      const data = r.raw(size * count);
      const sub = new Reader(data, r.little);
      if (subtype === 3 && count >= 8) {
        sub.pos = 7 * 4;
        codePage = sub.int32();
      } else if (subtype === 4 && count >= 1) {
        sysmis = sub.float64();
      } else if (subtype === 11) {
        measures = [];
        for (let i = 0; i + 2 < count; i += 3) {
          measures.push(sub.int32());
          sub.int32();
          sub.int32();
        }
      } else if (subtype === 13) {
        longNames = data;
      } else if (subtype === 20) {
        encoding = new TextDecoder("ascii").decode(data).trim();
      } else if (subtype === 21) {
        // Value labels for long string variables.
        while (sub.remaining > 0) {
          const nameLen = sub.int32();
          const nm = new TextDecoder("ascii").decode(sub.raw(nameLen));
          sub.int32(); // width
          const n = sub.int32();
          for (let i = 0; i < n; i++) {
            const vl = sub.int32();
            const value = sub.raw(vl);
            const ll = sub.int32();
            longStringLabels.push({ name: nm, value, label: sub.raw(ll) });
          }
        }
      }
      r.pos = start + size * count;
    } else if (recType === 999) {
      r.int32();
      break;
    } else {
      throw new Error(`Nežinomas .sav įrašo tipas (${recType}) – failas gali būti sugadintas.`);
    }
  }

  const dec = makeDecoder(encoding ?? codePageLabel(codePage));
  const text = (b: Uint8Array) => dec.decode(b).replace(/[\s\0]+$/, "");

  vars.forEach((v, i) => {
    v.shortName = text(shortNameBytes.get(v)!);
    v.name = v.shortName;
    const lb = varLabelBytes.get(v);
    if (lb) v.label = text(lb);
    v.measure = measures[i] ?? 0;
    const sm = (v as RawVar & { _strMissing?: Uint8Array[] })._strMissing;
    if (sm) v.stringMissing = sm.map(text);
  });
  if (longNames) {
    const byShort = new Map(vars.map((v) => [v.shortName.toUpperCase(), v]));
    for (const pair of dec.decode(longNames).split("\t")) {
      const eq = pair.indexOf("=");
      if (eq < 0) continue;
      const v = byShort.get(pair.slice(0, eq).toUpperCase());
      if (v) v.name = pair.slice(eq + 1).replace(/[\s\0]+$/, "");
    }
  }
  for (const set of valueLabelBytes) {
    for (const slot of set.slots) {
      const v = slotOwner[slot];
      if (!v) continue;
      set.values.forEach((valBytes, i) => {
        const key = v.width === 0 ? r.peekFloat64At(valBytes) : text(valBytes);
        v.valueLabels.set(key, text(set.labels[i]));
      });
    }
  }
  for (const l of longStringLabels) {
    const v = vars.find((x) => x.name === l.name || x.shortName === l.name);
    if (v) v.valueLabels.set(text(l.value), text(l.label));
  }

  // ---------- data ----------
  const totalSlots = slotOwner.length;
  const rows: Record<string, number | string | null>[] = [];
  const isMissing = (v: RawVar, x: number) =>
    x === sysmis ||
    Number.isNaN(x) ||
    v.missing.values.includes(x) ||
    (v.missing.range !== undefined && x >= v.missing.range[0] && x <= v.missing.range[1]);

  // A stream of 8-byte slot values; bytecode decompression is folded in here.
  let cmd: Uint8Array = new Uint8Array(0);
  let cmdPos = 8;
  const SPACES = new Uint8Array(8).fill(0x20);
  const nextSlot = (): { num?: number; bytes?: Uint8Array; sysmis?: true } | null => {
    if (compression === 0) {
      if (r.remaining < 8) return null;
      return { bytes: r.raw(8) };
    }
    for (;;) {
      if (cmdPos >= 8) {
        if (r.remaining < 8) return null;
        cmd = r.raw(8);
        cmdPos = 0;
      }
      const c = cmd[cmdPos++];
      if (c === 0) continue;
      if (c === 252) return null;
      if (c === 253) return r.remaining >= 8 ? { bytes: r.raw(8) } : null;
      if (c === 254) return { bytes: SPACES };
      if (c === 255) return { sysmis: true };
      return { num: c - bias };
    }
  };

  const maxCases = nCasesHeader >= 0 ? nCasesHeader : Infinity;
  outer: while (rows.length < maxCases) {
    const row: Record<string, number | string | null> = {};
    let slot = 0;
    while (slot < totalSlots) {
      const v = slotOwner[slot]!;
      if (v.width === 0) {
        const s = nextSlot();
        if (!s) {
          if (slot === 0) break outer;
          throw new Error("Failas nutrūkęs – .sav failas nepilnas arba sugadintas.");
        }
        const x = s.sysmis ? sysmis : s.num !== undefined ? s.num : r.peekFloat64At(s.bytes!);
        row[v.name] = isMissing(v, x) ? null : x;
        slot++;
      } else {
        const parts = new Uint8Array(v.slots * 8);
        for (let k = 0; k < v.slots; k++) {
          const s = nextSlot();
          if (!s) {
            if (slot === 0 && k === 0) break outer;
            throw new Error("Failas nutrūkęs – .sav failas nepilnas arba sugadintas.");
          }
          parts.set(s.bytes ?? SPACES, k * 8);
        }
        const str = text(parts.subarray(0, v.width)).trim();
        row[v.name] = str === "" || v.stringMissing.includes(str) ? null : str;
        slot += v.slots;
      }
    }
    rows.push(row);
  }

  const variables: Variable[] = vars.map((v) => {
    const labels = Object.fromEntries(
      [...v.valueLabels.entries()]
        .filter(([k]) => !(typeof k === "number" && isMissing(v, k)))
        .map(([k, l]) => [String(k), l])
    );
    const hasLabels = Object.keys(labels).length > 0;
    // Strings and nominal variables are categorical. The measurement level is otherwise
    // unreliable (SPSS and haven default to "scale"), so a numeric variable whose every
    // observed value carries a label, with few distinct codes, is categorical too.
    // Likert items land here; the prep steps and scale tests still read their codes as numbers.
    const observed = new Set(rows.map((row) => row[v.name]).filter((x) => x !== null).map(String));
    const allLabelled = hasLabels && [...observed].every((x) => x in labels);
    const categorical = v.width > 0 || v.measure === 1 || (allLabelled && observed.size <= 12);
    return {
      key: v.name,
      label: v.label || v.name,
      type: categorical ? "categorical" : "numeric",
      ...(categorical ? { valueLabels: labels } : {}),
    };
  });

  return {
    name,
    description: `SPSS failas: ${rows.length} eil. × ${variables.length} kintamųjų.`,
    variables,
    rows,
  };
}
