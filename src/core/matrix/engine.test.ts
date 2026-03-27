import { describe, expect, it } from "vitest";
import type { MatrixData } from "@core/contracts";
import {
  MatrixComputationError,
  determinant,
  invertMatrix,
  multiplyMatrices,
  solveLinearSystem
} from "./engine";

function matrix(values: number[][]): MatrixData {
  return {
    rows: values.length,
    columns: values[0]?.length ?? 0,
    values
  };
}

describe("matrix engine", () => {
  it("computes determinants through pivoted elimination", () => {
    const result = determinant(
      matrix([
        [6, 1, 1],
        [4, -2, 5],
        [2, 8, 7]
      ])
    );

    expect(result.value).toBeCloseTo(-306, 12);
    expect(result.diagnostics.pivotStrategy).toBe("partial");
    expect(result.diagnostics.singular).toBe(false);
  });

  it("computes inverses that multiply back to identity", () => {
    const source = matrix([
      [4, 7],
      [2, 6]
    ]);

    const inverse = invertMatrix(source);
    const product = multiplyMatrices(source, inverse.matrix);

    expect(product.values[0]![0]!).toBeCloseTo(1, 12);
    expect(product.values[0]![1]!).toBeCloseTo(0, 12);
    expect(product.values[1]![0]!).toBeCloseTo(0, 12);
    expect(product.values[1]![1]!).toBeCloseTo(1, 12);
    expect(inverse.diagnostics.conditionEstimate).toBeGreaterThan(1);
  });

  it("solves linear systems with partial pivoting when the leading entry is zero", () => {
    const result = solveLinearSystem(
      matrix([
        [0, 2],
        [1, 1]
      ]),
      [4, 3]
    );

    expect(result.solution[0]).toBeCloseTo(1, 12);
    expect(result.solution[1]).toBeCloseTo(2, 12);
    expect(result.residualNorm).toBeCloseTo(0, 12);
    expect(result.diagnostics.pivotStrategy).toBe("partial");
  });

  it("raises explicit singularity errors", () => {
    expect(() =>
      invertMatrix(
        matrix([
          [1, 2],
          [2, 4]
        ])
      )
    ).toThrowError(
      expect.objectContaining<Partial<MatrixComputationError>>({
        code: "matrix_singular"
      })
    );
  });
});
