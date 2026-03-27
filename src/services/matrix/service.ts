import type {
  CalculatorSettings,
  ComputationIssue,
  LinearSystemRequest,
  MatrixData,
  MatrixOperationRequest,
  MatrixService,
  ResultEnvelope
} from "@core/contracts";
import {
  MAX_MATRIX_SIZE,
  MatrixComputationError,
  addMatrices,
  determinant,
  invertMatrix,
  multiplyMatrices,
  solveLinearSystem,
  subtractMatrices,
  transposeMatrix
} from "@core/matrix";

const MIN_MATRIX_SIZE = 2;

export function createMatrixService(): MatrixService {
  return {
    evaluate(request) {
      try {
        validateUiMatrixBounds(request.left, "left");
        if (request.right) {
          validateUiMatrixBounds(request.right, "right");
        }

        switch (request.operation) {
          case "add":
            return succeed(
              request.settings,
              {
                operation: request.operation,
                matrix: addMatrices(request.left, requireRightMatrix(request.right))
              },
              []
            );
          case "subtract":
            return succeed(
              request.settings,
              {
                operation: request.operation,
                matrix: subtractMatrices(request.left, requireRightMatrix(request.right))
              },
              []
            );
          case "multiply":
            return succeed(
              request.settings,
              {
                operation: request.operation,
                matrix: multiplyMatrices(request.left, requireRightMatrix(request.right))
              },
              []
            );
          case "transpose":
            return succeed(
              request.settings,
              {
                operation: request.operation,
                matrix: transposeMatrix(request.left),
                diagnostics: {
                  pivotStrategy: "none",
                  singular: false
                }
              },
              []
            );
          case "determinant": {
            const result = determinant(request.left, { tolerance: request.settings.numeric.solverTolerance });
            return succeed(
              request.settings,
              {
                operation: request.operation,
                scalar: formatNumber(result.value, request.settings),
                diagnostics: result.diagnostics
              },
              buildConditionIssues(result.diagnostics.conditionEstimate)
            );
          }
          case "inverse": {
            const result = invertMatrix(request.left, { tolerance: request.settings.numeric.solverTolerance });
            return succeed(
              request.settings,
              {
                operation: request.operation,
                matrix: result.matrix,
                diagnostics: result.diagnostics
              },
              buildConditionIssues(result.diagnostics.conditionEstimate)
            );
          }
          default:
            return fail(request.settings, [
              {
                code: "matrix_operation_unsupported",
                message: `Unsupported matrix operation: ${String(request.operation)}`,
                severity: "error",
                field: "operation"
              }
            ]);
        }
      } catch (error) {
        return fail(request.settings, [toIssue(error)]);
      }
    },
    solveLinearSystem(request) {
      try {
        validateUiMatrixBounds(request.matrix, "matrix");
        const result = solveLinearSystem(request.matrix, request.rightHandSide, {
          tolerance: request.settings.numeric.solverTolerance
        });

        return succeed(
          request.settings,
          {
            solution: result.solution,
            residualNorm: result.residualNorm,
            diagnostics: result.diagnostics
          },
          buildConditionIssues(result.diagnostics.conditionEstimate)
        );
      } catch (error) {
        return fail(request.settings, [toIssue(error)]);
      }
    }
  };
}

function requireRightMatrix(matrix: MatrixData | undefined): MatrixData {
  if (!matrix) {
    throw new MatrixComputationError(
      "matrix_missing_operand",
      "This matrix operation requires a right-hand matrix.",
      "right"
    );
  }

  return matrix;
}

function validateUiMatrixBounds(matrix: MatrixData, fieldPrefix: string): void {
  if (matrix.rows < MIN_MATRIX_SIZE || matrix.rows > MAX_MATRIX_SIZE) {
    throw new MatrixComputationError(
      "matrix_size_out_of_range",
      `Matrix row count must stay within ${MIN_MATRIX_SIZE}x${MIN_MATRIX_SIZE} through ${MAX_MATRIX_SIZE}x${MAX_MATRIX_SIZE} work.`,
      `${fieldPrefix}.rows`
    );
  }

  if (matrix.columns < MIN_MATRIX_SIZE || matrix.columns > MAX_MATRIX_SIZE) {
    throw new MatrixComputationError(
      "matrix_size_out_of_range",
      `Matrix column count must stay within ${MIN_MATRIX_SIZE}x${MIN_MATRIX_SIZE} through ${MAX_MATRIX_SIZE}x${MAX_MATRIX_SIZE} work.`,
      `${fieldPrefix}.columns`
    );
  }
}

function succeed<T>(
  settings: CalculatorSettings,
  value: T,
  issues: ComputationIssue[]
): ResultEnvelope<T> {
  return {
    ok: true,
    value,
    issues,
    metadata: {
      backend: settings.numeric.backend
    }
  };
}

function fail<T>(settings: CalculatorSettings, issues: ComputationIssue[]): ResultEnvelope<T> {
  return {
    ok: false,
    issues,
    metadata: {
      backend: settings.numeric.backend
    }
  };
}

function toIssue(error: unknown): ComputationIssue {
  if (error instanceof MatrixComputationError) {
    const issue: ComputationIssue = {
      code: error.code,
      message: error.message,
      severity: "error"
    };
    if (error.field !== undefined) {
      issue.field = error.field;
    }
    return issue;
  }

  return {
    code: "matrix_unknown_error",
    message: error instanceof Error ? error.message : "Unknown matrix error.",
    severity: "error"
  };
}

function buildConditionIssues(conditionEstimate: number | undefined): ComputationIssue[] {
  if (conditionEstimate === undefined || conditionEstimate < 1e8) {
    return [];
  }

  return [
    {
      code: "matrix_ill_conditioned",
      message: "Matrix appears ill-conditioned; small input changes may cause large output changes.",
      severity: "warning",
      field: "left"
    }
  ];
}

function formatNumber(value: number, settings: CalculatorSettings): string {
  const precision = Math.min(15, Math.max(2, Math.trunc(settings.numeric.displayPrecision)));
  const normalized = normalizeNegativeZero(value);

  if (normalized === 0) {
    return "0";
  }

  switch (settings.numeric.displayMode) {
    case "scientific":
      return normalized.toExponential(precision - 1);
    case "engineering":
      return formatEngineering(normalized, precision);
    case "normal":
    default:
      return Number.parseFloat(normalized.toPrecision(precision)).toString();
  }
}

function formatEngineering(value: number, precision: number): string {
  const exponent = Math.floor(Math.log10(Math.abs(value)) / 3) * 3;
  const mantissa = value / 10 ** exponent;
  return `${mantissa.toPrecision(precision)}e${exponent >= 0 ? "+" : ""}${exponent}`;
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}
