import { describe, expect, it } from "vitest";
import { ptukey, qtukey } from "./distributions";

// Values from R 4.4: ptukey(q, nmeans, df, lower.tail = FALSE) and qtukey(.95, 3, 20).
describe("studentized range distribution", () => {
  const cases: [number, number, number, number][] = [
    [3.5, 3, 20, 0.0558918491],
    [2.1, 4, 57.3, 0.4531252202],
    [5, 6, 8, 0.0584833247],
    [1, 2, 1000, 0.4796648624],
    [4, 3, 30000, 0.0129876614],
  ];
  for (const [q, k, df, p] of cases) {
    it(`P(Q > ${q} | k = ${k}, df = ${df})`, () => {
      expect(1 - ptukey(q, k, df)).toBeCloseTo(p, 7);
    });
  }
  it("qtukey(.95, 3, 20)", () => {
    expect(qtukey(0.95, 3, 20)).toBeCloseTo(3.5779345815, 5);
  });
});
