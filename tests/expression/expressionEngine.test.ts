import { describe, expect, it } from "vitest";
import type { CalculatorSettings } from "@core/contracts";
import { parseTokens, tokenizeExpression } from "@core/expression";
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

describe("expression engine", () => {
  it("tokenizes scientific notation and parses nested expressions", () => {
    const tokenized = tokenizeExpression("1.2e-12 + sqrt(2)");
    const parsed = parseTokens(tokenized.tokens);

    expect(tokenized.issues).toEqual([]);
    expect(tokenized.tokens.map((token) => token.type)).toEqual([
      "number",
      "plus",
      "identifier",
      "leftParen",
      "number",
      "rightParen",
      "eof"
    ]);
    expect(parsed.issues).toEqual([]);
    expect(parsed.ast).toMatchObject({
      kind: "binary",
      operator: "+"
    });
  });

  it("evaluates function-rich identities correctly", async () => {
    const service = createCalculationService();
    const result = await service.calculate({
      expression: "sin(pi/3)^2 + cos(pi/3)^2",
      settings: makeSettings()
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.canonicalExpression).toBe("sin(pi / 3) ^ 2 + cos(pi / 3) ^ 2");
      expect(result.value.approximateValue).toBeCloseTo(1, 12);
    }
  });

  it("returns structured diagnostics for invalid expressions", async () => {
    const service = createCalculationService();
    const result = await service.calculate({
      expression: "sin(",
      settings: makeSettings()
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toMatchObject({
        code: "expression.expected_operand",
        severity: "error",
        field: "expression"
      });
    }
  });

  it("resolves user variables through the compiled evaluator", async () => {
    const service = createCalculationService();
    const result = await service.calculate({
      expression: "gain * exp(offset)",
      settings: makeSettings(),
      variables: {
        gain: 3,
        offset: "1"
      }
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.approximateValue).toBeCloseTo(3 * Math.E, 12);
    }
  });
});
