import { describe, expect, it } from "vitest";
import type { CalculatorSettings } from "@core/contracts";
import { createDefaultSettingsDocument } from "@persistence/schema";
import { createCalculationService } from "../../src/services/calculate";

function makeSettings(overrides?: Partial<CalculatorSettings["numeric"]>): CalculatorSettings {
  return {
    ...createDefaultSettingsDocument().payload,
    numeric: {
      ...createDefaultSettingsDocument().payload.numeric,
      ...overrides
    }
  };
}

describe("precision modes", () => {
  it("switches trig interpretation when angle mode changes", async () => {
    const service = createCalculationService();
    const degreeResult = await service.calculate({
      expression: "sin(90)",
      settings: makeSettings({
        angleMode: "degree"
      })
    });
    const radianResult = await service.calculate({
      expression: "sin(90)",
      settings: makeSettings({
        angleMode: "radian"
      })
    });

    expect(degreeResult.ok).toBe(true);
    expect(radianResult.ok).toBe(true);
    if (degreeResult.ok && radianResult.ok) {
      expect(degreeResult.value.approximateValue).toBeCloseTo(1, 12);
      expect(radianResult.value.approximateValue).not.toBeCloseTo(1, 6);
    }
  });

  it("formats values in engineering notation", async () => {
    const service = createCalculationService();
    const result = await service.calculate({
      expression: "12345",
      settings: makeSettings({
        displayMode: "engineering",
        displayPrecision: 5
      })
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.formattedValue).toBe("12.345e+3");
    }
  });

  it("preserves large-plus-small cancellation under the decimal backend", async () => {
    const service = createCalculationService();
    const floatResult = await service.calculate({
      expression: "(1e20 + 1) - 1e20",
      settings: makeSettings({
        backend: "float64"
      })
    });
    const decimalResult = await service.calculate({
      expression: "(1e20 + 1) - 1e20",
      settings: makeSettings({
        backend: "decimal",
        internalPrecision: 50
      })
    });

    expect(floatResult.ok).toBe(true);
    expect(decimalResult.ok).toBe(true);
    if (floatResult.ok && decimalResult.ok) {
      expect(floatResult.value.approximateValue).toBe(0);
      expect(decimalResult.value.formattedValue).toBe("1");
      expect(decimalResult.value.approximateValue).toBe(1);
    }
  });

  it("handles near-cancellation cases more accurately with decimal precision", async () => {
    const service = createCalculationService();
    const floatResult = await service.calculate({
      expression: "sqrt(2)^2 - 2",
      settings: makeSettings({
        backend: "float64"
      })
    });
    const decimalResult = await service.calculate({
      expression: "sqrt(2)^2 - 2",
      settings: makeSettings({
        backend: "decimal",
        internalPrecision: 60,
        displayPrecision: 18
      })
    });

    expect(floatResult.ok).toBe(true);
    expect(decimalResult.ok).toBe(true);
    if (floatResult.ok && decimalResult.ok) {
      expect(Math.abs(floatResult.value.approximateValue ?? 0)).toBeGreaterThan(0);
      expect(Math.abs(decimalResult.value.approximateValue ?? 0)).toBeLessThanOrEqual(
        Math.abs(floatResult.value.approximateValue ?? 0)
      );
    }
  });
});
