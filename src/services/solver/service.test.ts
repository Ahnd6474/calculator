import { describe, expect, it } from "vitest";
import { createDefaultSettingsDocument } from "@persistence/schema";
import { createSolverService } from "./service";

const baseSettings = createDefaultSettingsDocument().payload;

describe("solver service", () => {
  it("solves equations by routing them through the expression pipeline", async () => {
    const service = createSolverService();
    const result = await Promise.resolve(
      service.solve({
        method: "newton",
        expression: "x^2 = 2",
        initialGuess: 1,
        settings: baseSettings
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.converged).toBe(true);
    expect(result.value.root).toBeCloseTo(Math.SQRT2, 9);
    expect(result.value.canonicalExpression).toContain("x ^ 2");
    expect(result.value.formattedResidual).toContain("e");
  });

  it("fails fast for invalid bisection intervals", async () => {
    const service = createSolverService();
    const result = await Promise.resolve(
      service.solve({
        method: "bisection",
        expression: "x^2 - 2",
        bracket: [2, 3],
        settings: baseSettings
      })
    );

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe("solver_invalid_bracket");
  });

  it("returns non-convergent diagnostics without dropping iteration history", async () => {
    const service = createSolverService();
    const result = await Promise.resolve(
      service.solve({
        method: "bisection",
        expression: "x^2 - 2",
        bracket: [1, 2],
        settings: {
          ...baseSettings,
          numeric: {
            ...baseSettings.numeric,
            solverTolerance: 1e-16,
            maxIterations: 1
          }
        }
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.converged).toBe(false);
    expect(result.value.terminationReason).toBe("max_iterations");
    expect(result.issues[0]?.code).toBe("solver_non_convergent");
    expect(result.value.history.length).toBe(1);
  });
});
