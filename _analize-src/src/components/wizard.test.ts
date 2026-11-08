import { describe, expect, it } from "vitest";
import { WIZARD_TREE, type Leaf, type Node } from "./TestWizard";
import { getTest } from "../stats/tests";

function leaves(n: Node | Leaf): Leaf[] {
  return "q" in n ? n.options.flatMap((o) => leaves(o.next)) : [n];
}

describe("test-picker helper", () => {
  it("every recommendation is a test the app has", () => {
    const ids = leaves(WIZARD_TREE).flatMap((l) => ("testId" in l ? [l.testId] : []));
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(() => getTest(id)).not.toThrow();
  });
});
