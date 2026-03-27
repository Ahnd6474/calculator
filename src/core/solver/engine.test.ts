import { describe, expect, it } from "vitest";
import { createDefaultSettingsDocument } from "@persistence/schema";
import { createFloat64Runtime } from "@core/precision";
import { SolverComputationError, solveRoot } from "./engine";

const runtime = createFloat64Runtime(createDefaultSettingsDocument().payload.numeric);

describe("solver engine", () => {
  it("converges with Newton-Raphson for a smooth root", () => {
    const result = solveRoot({
      method: "newton",
      runtime,
      tolerance: 1e-10,
      maxIterations: 20,
      initialGuess: 1,
      evaluate(value) {
        return value * value - 2;
      }
    });

    expect(result.converged).toBe(true);
    expect(runtime.toNumber(result.root)).toBeCloseTo(Math.SQRT2, 9);
    expect(result.terminationReason).toBe("residual_tolerance");
  });

  it("converges with bisection when the interval brackets a sign change", () => {
    const result = solveRoot({
      method: "bisection",
      runtime,
      tolerance: 1e-10,
      maxIterations: 80,
      bracket: [1, 2],
      evaluate(value) {
        return value * value - 2;
      }
    });

    expect(result.converged).toBe(true);
    expect(runtime.toNumber(result.root)).toBeCloseTo(Math.SQRT2, 9);
    expect(result.history.length).toBeGreaterThan(0);
  });

  it("rejects bisection intervals that do not change sign", () => {
    expect(() =>
      solveRoot({
        method: "bisection",
        runtime,
        tolerance: 1e-10,
        maxIterations: 20,
        bracket: [2, 3],
        evaluate(value) {
          return value * value - 2;
        }
      })
    ).toThrowError(SolverComputationError);
  });

  it("reports non-convergence when the iteration budget is exhausted", () => {
    const result = solveRoot({
      method: "bisection",
      runtime,
      tolerance: 1e-16,
      maxIterations: 1,
      bracket: [1, 2],
      evaluate(value) {
        return value * value - 2;
      }
    });

    expect(result.converged).toBe(false);
    expect(result.terminationReason).toBe("max_iterations");
  });
});
