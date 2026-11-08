import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { datasetFromSav } from "./sav";
import { apklausa } from "./apklausa";

const load = (f: string) => {
  const b = readFileSync(new URL(`./fixtures/${f}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe(".sav import", () => {
  for (const file of ["apklausa.sav", "apklausa-uncompressed.sav"]) {
    it(`${file}: same rows and labels as the demo dataset`, () => {
      const ds = datasetFromSav(load(file), "apklausa");
      expect(ds.rows).toHaveLength(apklausa.rows.length);
      expect(ds.variables.map((v) => v.key)).toEqual(apklausa.variables.map((v) => v.key));
      for (const key of ["lytis", "S4", "miegas", "vidurkis", "savijauta_po"]) {
        expect(ds.rows.map((r) => r[key])).toEqual(apklausa.rows.map((r) => r[key]));
      }
      const sritis = ds.variables.find((v) => v.key === "sritis")!;
      expect(sritis.label).toBe("Studijų sritis");
      expect(sritis.type).toBe("categorical");
      expect(sritis.valueLabels?.["4"]).toBe("Sveikatos mokslai");
      expect(ds.variables.find((v) => v.key === "miegas")!.label).toBe("Miego trukmė");
    });
  }

  it("user-missing values become null; Lithuanian strings decode", () => {
    const ds = datasetFromSav(load("user-missing.sav"));
    expect(ds.rows.map((r) => r.q)).toEqual([1, 2, null, 3, null]);
    expect(ds.rows.map((r) => r.vardas)).toEqual(["Ąžuolas", "Eglė", "Šarūnas", "Žydrūnė", null]);
    expect(ds.variables[0].label).toBe("Klausimas");
  });

  it("rejects non-SPSS files", () => {
    expect(() => datasetFromSav(new TextEncoder().encode("a,b\n1,2").buffer)).toThrow(/ne SPSS/);
  });
});
