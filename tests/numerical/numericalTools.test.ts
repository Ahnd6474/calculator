import { describe, expect, it } from "vitest";
import type { CalculatorSettings } from "@core/contracts";
import { createDefaultSettingsDocument } from "@persistence/schema";
import { createNumericalToolsService } from "../../src/services/numerical";

function makeSettings(overrides?: Partial<CalculatorSettings["numeric"]>): CalculatorSettings {
  return {
    ...createDefaultSettingsDocument().payload,
    numeric: {
      ...createDefaultSettingsDocument().payload.numeric,
      ...overrides
    }
  };
}

describe("numerical tools service", () => {
  it("differentiates with angle-aware central differences", async () => {
    const service = createNumericalToolsService();
    const result = await service.run({
      tool: "differentiate",
      expression: "sin(x)",
      point: 0,
      differentiationMethod: "central",
      settings: makeSettings({
        angleMode: "degree",
        solverTolerance: 1e-8
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.method).toBe("central");
    expect(result.value.approximateValue).toBeCloseTo(Math.PI / 180, 6);
  });

  it("integrates smooth functions accurately with Simpson panels", async () => {
    const service = createNumericalToolsService();
    const result = await service.run({
      tool: "integrate",
      expression: "x^2",
      interval: [0, 1],
      integrationMethod: "simpson",
      settings: makeSettings({
        solverTolerance: 1e-10
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.method).toBe("simpson");
    expect(result.value.approximateValue).toBeCloseTo(1 / 3, 10);
    expect(result.issues).toEqual([]);
  });

  it("surfaces a warning near non-smooth derivative points", async () => {
    const service = createNumericalToolsService();
    const result = await service.run({
      tool: "differentiate",
      expression: "abs(x)",
      point: 0,
      differentiationMethod: "central",
      settings: makeSettings({
        solverTolerance: 1e-10
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.code)).toContain("numerical.point_nonsmooth");
  });

  it("warns when trapezoidal refinement exhausts the panel budget", async () => {
    const service = createNumericalToolsService();
    const result = await service.run({
      tool: "integrate",
      expression: "sin(x)",
      interval: [0, Math.PI],
      integrationMethod: "trapezoidal",
      settings: makeSettings({
        solverTolerance: 1e-12,
        maxIterations: 4
      })
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.code)).toContain("numerical.integration_not_converged");
  });

  it("fails clearly when the integrand is singular at an endpoint", async () => {
    const service = createNumericalToolsService();
    const result = await service.run({
      tool: "integrate",
      expression: "1 / sqrt(x)",
      interval: [0, 1],
      integrationMethod: "simpson",
      settings: makeSettings()
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues[0]?.code).toBe("math.division_by_zero");
  });
});
