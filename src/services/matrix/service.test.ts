import { describe, expect, it } from "vitest";
import { createDefaultSettingsDocument } from "@persistence/schema";
import { createMatrixService } from "./service";

const settings = createDefaultSettingsDocument().payload;

describe("matrix service", () => {
  it("returns explicit failures for incompatible matrix dimensions", async () => {
    const service = createMatrixService();
    const result = await Promise.resolve(
      service.evaluate({
        operation: "add",
        left: {
          rows: 2,
          columns: 2,
          values: [
            [1, 2],
            [3, 4]
          ]
        },
        right: {
          rows: 2,
          columns: 3,
          values: [
            [1, 2, 3],
            [4, 5, 6]
          ]
        },
        settings
      })
    );

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("matrix_dimension_mismatch");
  });

  it("formats determinant results and carries pivot diagnostics", async () => {
    const service = createMatrixService();
    const result = await Promise.resolve(
      service.evaluate({
        operation: "determinant",
        left: {
          rows: 2,
          columns: 2,
          values: [
            [4, 6],
            [3, 8]
          ]
        },
        settings
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.scalar).toBe("14");
    expect(result.value.diagnostics?.pivotStrategy).toBe("partial");
  });

  it("reports singular systems through failed result envelopes", async () => {
    const service = createMatrixService();
    const result = await Promise.resolve(
      service.solveLinearSystem({
        matrix: {
          rows: 2,
          columns: 2,
          values: [
            [1, 2],
            [2, 4]
          ]
        },
        rightHandSide: [1, 2],
        settings
      })
    );

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("matrix_singular");
  });
});
