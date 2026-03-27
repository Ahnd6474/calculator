import { describe, expect, it } from "vitest";
import type {
  CalculatorServices,
  CalculationService,
  MatrixService,
  NumericalToolsService,
  SolverService
} from "@core/contracts";
import {
  SETTINGS_SCHEMA_VERSION,
  WORKSPACE_SCHEMA_VERSION,
  createDefaultSettingsDocument,
  createDefaultWorkspaceDocument
} from "@persistence/schema";

function createNoopCalculationService(): CalculationService {
  return {
    calculate(request) {
      return {
        ok: true,
        value: {
          canonicalExpression: request.expression,
          formattedValue: "0",
          approximateValue: 0
        },
        issues: [],
        metadata: {
          backend: request.settings.numeric.backend
        }
      };
    }
  };
}

function createNoopMatrixService(): MatrixService {
  return {
    evaluate(request) {
      return {
        ok: true,
        value: {
          operation: request.operation,
          matrix: request.left
        },
        issues: [],
        metadata: {
          backend: request.settings.numeric.backend
        }
      };
    },
    solveLinearSystem(request) {
      return {
        ok: true,
        value: {
          solution: request.rightHandSide
        },
        issues: [],
        metadata: {
          backend: request.settings.numeric.backend
        }
      };
    }
  };
}

function createNoopSolverService(): SolverService {
  return {
    solve(request) {
      return {
        ok: true,
        value: {
          root: request.initialGuess ?? 0,
          residual: 0,
          iterations: 0,
          converged: true,
          history: []
        },
        issues: [],
        metadata: {
          backend: request.settings.numeric.backend
        }
      };
    }
  };
}

function createNoopNumericalService(): NumericalToolsService {
  return {
    run(request) {
      return {
        ok: true,
        value: {
          tool: request.tool,
          formattedValue: "0"
        },
        issues: [],
        metadata: {
          backend: request.settings.numeric.backend
        }
      };
    }
  };
}

describe("shared contracts", () => {
  it("keeps versioned defaults available for later feature nodes", () => {
    const settings = createDefaultSettingsDocument();
    const workspace = createDefaultWorkspaceDocument();

    expect(settings.version).toBe(SETTINGS_SCHEMA_VERSION);
    expect(workspace.version).toBe(WORKSPACE_SCHEMA_VERSION);
    expect(workspace.payload.activeTool).toBe("calculate");
  });

  it("allows the app shell to depend only on typed service boundaries", () => {
    const services: CalculatorServices = {
      calculate: createNoopCalculationService(),
      matrix: createNoopMatrixService(),
      solver: createNoopSolverService(),
      numerical: createNoopNumericalService()
    };

    expect(services.calculate).toBeDefined();
    expect(services.matrix).toBeDefined();
    expect(services.solver).toBeDefined();
    expect(services.numerical).toBeDefined();
  });
});
