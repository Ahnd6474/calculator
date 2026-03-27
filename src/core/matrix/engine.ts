import type { ConditionDiagnostics, MatrixData } from "@core/contracts";

export const MAX_MATRIX_SIZE = 6;

export interface MatrixEngineOptions {
  tolerance?: number;
}

export interface MatrixScalarComputation {
  value: number;
  diagnostics: ConditionDiagnostics;
}

export interface MatrixComputation {
  matrix: MatrixData;
  diagnostics: ConditionDiagnostics;
}

export interface LinearSolveComputation {
  solution: number[];
  residualNorm: number;
  diagnostics: ConditionDiagnostics;
}

export class MatrixComputationError extends Error {
  readonly code: string;
  readonly field: string | undefined;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "MatrixComputationError";
    this.code = code;
    this.field = field;
  }
}

interface Decomposition {
  lu: number[][];
  permutation: number[];
  swapCount: number;
  threshold: number;
  normInfinity: number;
}

export function addMatrices(left: MatrixData, right: MatrixData): MatrixData {
  const leftValues = toValidatedValues(left, "left");
  const rightValues = toValidatedValues(right, "right");
  ensureMatchingDimensions(left, right, "matrix_dimension_mismatch", "Matrix addition requires matching dimensions.");

  return fromValues(
    leftValues.map((row, rowIndex) =>
      row.map((value, columnIndex) => value + rightValues[rowIndex]![columnIndex]!)
    )
  );
}

export function subtractMatrices(left: MatrixData, right: MatrixData): MatrixData {
  const leftValues = toValidatedValues(left, "left");
  const rightValues = toValidatedValues(right, "right");
  ensureMatchingDimensions(left, right, "matrix_dimension_mismatch", "Matrix subtraction requires matching dimensions.");

  return fromValues(
    leftValues.map((row, rowIndex) =>
      row.map((value, columnIndex) => value - rightValues[rowIndex]![columnIndex]!)
    )
  );
}

export function multiplyMatrices(left: MatrixData, right: MatrixData): MatrixData {
  const leftValues = toValidatedValues(left, "left");
  const rightValues = toValidatedValues(right, "right");

  if (left.columns !== right.rows) {
    throw new MatrixComputationError(
      "matrix_dimension_mismatch",
      "Matrix multiplication requires the left column count to match the right row count.",
      "right.rows"
    );
  }

  const values = Array.from({ length: left.rows }, (_, rowIndex) =>
    Array.from({ length: right.columns }, (_, columnIndex) => {
      let sum = 0;
      for (let innerIndex = 0; innerIndex < left.columns; innerIndex += 1) {
        sum += leftValues[rowIndex]![innerIndex]! * rightValues[innerIndex]![columnIndex]!;
      }
      return sum;
    })
  );

  return fromValues(values);
}

export function transposeMatrix(matrix: MatrixData): MatrixData {
  const values = toValidatedValues(matrix, "left");

  return fromValues(
    Array.from({ length: matrix.columns }, (_, columnIndex) =>
      Array.from({ length: matrix.rows }, (_, rowIndex) => values[rowIndex]![columnIndex]!)
    )
  );
}

export function determinant(matrix: MatrixData, options: MatrixEngineOptions = {}): MatrixScalarComputation {
  const values = toValidatedValues(matrix, "left");
  ensureSquare(matrix, "Determinant requires a square matrix.");

  const decomposition = decomposeWithPartialPivoting(values, options);
  let value = decomposition.swapCount % 2 === 0 ? 1 : -1;
  for (let index = 0; index < matrix.rows; index += 1) {
    value *= decomposition.lu[index]![index]!;
  }

  return {
    value,
    diagnostics: {
      pivotStrategy: "partial",
      singular: false,
      conditionEstimate: estimateConditionNumberFromDecomposition(decomposition)
    }
  };
}

export function invertMatrix(matrix: MatrixData, options: MatrixEngineOptions = {}): MatrixComputation {
  const values = toValidatedValues(matrix, "left");
  ensureSquare(matrix, "Matrix inversion requires a square matrix.");

  const decomposition = decomposeWithPartialPivoting(values, options);
  const inverseValues = invertFromDecomposition(decomposition);

  return {
    matrix: fromValues(inverseValues),
    diagnostics: {
      pivotStrategy: "partial",
      singular: false,
      conditionEstimate: normInfinity(values) * normInfinity(inverseValues)
    }
  };
}

export function solveLinearSystem(
  matrix: MatrixData,
  rightHandSide: number[],
  options: MatrixEngineOptions = {}
): LinearSolveComputation {
  const values = toValidatedValues(matrix, "matrix");
  ensureSquare(matrix, "Linear solve requires a square coefficient matrix.");

  if (rightHandSide.length !== matrix.rows) {
    throw new MatrixComputationError(
      "matrix_dimension_mismatch",
      "Linear solve requires one right-hand-side entry per matrix row.",
      "rightHandSide"
    );
  }

  const sanitizedRightHandSide = rightHandSide.map((value, index) => {
    if (!Number.isFinite(value)) {
      throw new MatrixComputationError(
        "matrix_invalid_value",
        "Right-hand-side values must be finite numbers.",
        `rightHandSide[${index}]`
      );
    }
    return value;
  });

  const decomposition = decomposeWithPartialPivoting(values, options);
  const solution = solveFromDecomposition(decomposition, sanitizedRightHandSide);
  const residualNorm = vectorInfinityNorm(subtractVectors(multiplyMatrixVector(values, solution), sanitizedRightHandSide));

  return {
    solution,
    residualNorm,
    diagnostics: {
      pivotStrategy: "partial",
      singular: false,
      conditionEstimate: estimateConditionNumberFromDecomposition(decomposition)
    }
  };
}

function toValidatedValues(matrix: MatrixData, fieldPrefix: string): number[][] {
  if (!Number.isInteger(matrix.rows) || matrix.rows < 1 || matrix.rows > MAX_MATRIX_SIZE) {
    throw new MatrixComputationError(
      "matrix_size_out_of_range",
      `Matrix row count must be between 1 and ${MAX_MATRIX_SIZE}.`,
      `${fieldPrefix}.rows`
    );
  }

  if (!Number.isInteger(matrix.columns) || matrix.columns < 1 || matrix.columns > MAX_MATRIX_SIZE) {
    throw new MatrixComputationError(
      "matrix_size_out_of_range",
      `Matrix column count must be between 1 and ${MAX_MATRIX_SIZE}.`,
      `${fieldPrefix}.columns`
    );
  }

  if (matrix.values.length !== matrix.rows) {
    throw new MatrixComputationError(
      "matrix_shape_mismatch",
      "Matrix row metadata does not match the provided values.",
      `${fieldPrefix}.values`
    );
  }

  return matrix.values.map((row, rowIndex) => {
    if (row.length !== matrix.columns) {
      throw new MatrixComputationError(
        "matrix_shape_mismatch",
        "Matrix column metadata does not match the provided values.",
        `${fieldPrefix}.values[${rowIndex}]`
      );
    }

    return row.map((value, columnIndex) => {
      if (!Number.isFinite(value)) {
        throw new MatrixComputationError(
          "matrix_invalid_value",
          "Matrix entries must be finite numbers.",
          `${fieldPrefix}.values[${rowIndex}][${columnIndex}]`
        );
      }

      return value;
    });
  });
}

function ensureMatchingDimensions(
  left: MatrixData,
  right: MatrixData,
  code: string,
  message: string
): void {
  if (left.rows !== right.rows || left.columns !== right.columns) {
    throw new MatrixComputationError(code, message, "right");
  }
}

function ensureSquare(matrix: MatrixData, message: string): void {
  if (matrix.rows !== matrix.columns) {
    throw new MatrixComputationError("matrix_not_square", message, "left");
  }
}

function decomposeWithPartialPivoting(values: number[][], options: MatrixEngineOptions): Decomposition {
  const size = values.length;
  const lu = cloneValues(values);
  const permutation = Array.from({ length: size }, (_, index) => index);
  const matrixNorm = normInfinity(values);
  const requestedTolerance = Math.abs(options.tolerance ?? 1e-10);
  const threshold = Math.max(
    requestedTolerance * Math.max(1, matrixNorm),
    Number.EPSILON * Math.max(1, matrixNorm) * size * 16
  );
  let swapCount = 0;

  for (let pivotColumn = 0; pivotColumn < size; pivotColumn += 1) {
    let pivotRow = pivotColumn;
    let pivotMagnitude = Math.abs(lu[pivotColumn]![pivotColumn]!);

    for (let row = pivotColumn + 1; row < size; row += 1) {
      const candidate = Math.abs(lu[row]![pivotColumn]!);
      if (candidate > pivotMagnitude) {
        pivotMagnitude = candidate;
        pivotRow = row;
      }
    }

    if (pivotMagnitude <= threshold) {
      throw new MatrixComputationError(
        "matrix_singular",
        "Matrix is singular to the configured tolerance; determinant, inverse, or solve cannot proceed.",
        "left"
      );
    }

    if (pivotRow !== pivotColumn) {
      const pivotValues = lu[pivotColumn]!;
      lu[pivotColumn] = lu[pivotRow]!;
      lu[pivotRow] = pivotValues;

      const pivotIndex = permutation[pivotColumn]!;
      permutation[pivotColumn] = permutation[pivotRow]!;
      permutation[pivotRow] = pivotIndex;
      swapCount += 1;
    }

    for (let row = pivotColumn + 1; row < size; row += 1) {
      lu[row]![pivotColumn]! /= lu[pivotColumn]![pivotColumn]!;
      for (let column = pivotColumn + 1; column < size; column += 1) {
        lu[row]![column]! -= lu[row]![pivotColumn]! * lu[pivotColumn]![column]!;
      }
    }
  }

  return {
    lu,
    permutation,
    swapCount,
    threshold,
    normInfinity: matrixNorm
  };
}

function solveFromDecomposition(decomposition: Decomposition, rightHandSide: number[]): number[] {
  const size = decomposition.lu.length;
  const permuted = Array.from({ length: size }, (_, index) => rightHandSide[decomposition.permutation[index]!]!);
  const intermediate = Array.from({ length: size }, () => 0);
  const solution = Array.from({ length: size }, () => 0);

  for (let row = 0; row < size; row += 1) {
    let value = permuted[row]!;
    for (let column = 0; column < row; column += 1) {
      value -= decomposition.lu[row]![column]! * intermediate[column]!;
    }
    intermediate[row] = value;
  }

  for (let row = size - 1; row >= 0; row -= 1) {
    let value = intermediate[row]!;
    for (let column = row + 1; column < size; column += 1) {
      value -= decomposition.lu[row]![column]! * solution[column]!;
    }

    const pivot = decomposition.lu[row]![row]!;
    if (Math.abs(pivot) <= decomposition.threshold) {
      throw new MatrixComputationError(
        "matrix_singular",
        "Matrix is singular to the configured tolerance; determinant, inverse, or solve cannot proceed.",
        "left"
      );
    }

    solution[row] = value / pivot;
  }

  return solution;
}

function invertFromDecomposition(decomposition: Decomposition): number[][] {
  const size = decomposition.lu.length;
  const inverse = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));

  for (let column = 0; column < size; column += 1) {
    const basis = Array.from({ length: size }, (_, index) => (index === column ? 1 : 0));
    const solution = solveFromDecomposition(decomposition, basis);
    for (let row = 0; row < size; row += 1) {
      inverse[row]![column] = solution[row]!;
    }
  }

  return inverse;
}

function estimateConditionNumberFromDecomposition(decomposition: Decomposition): number {
  const inverse = invertFromDecomposition(decomposition);
  return decomposition.normInfinity * normInfinity(inverse);
}

function cloneValues(values: number[][]): number[][] {
  return values.map((row) => [...row]);
}

function fromValues(values: number[][]): MatrixData {
  return {
    rows: values.length,
    columns: values[0]?.length ?? 0,
    values: cloneValues(values)
  };
}

function normInfinity(values: number[][]): number {
  return values.reduce((maximum, row) => {
    const rowSum = row.reduce((sum, value) => sum + Math.abs(value), 0);
    return Math.max(maximum, rowSum);
  }, 0);
}

function vectorInfinityNorm(values: number[]): number {
  return values.reduce((maximum, value) => Math.max(maximum, Math.abs(value)), 0);
}

function multiplyMatrixVector(values: number[][], vector: number[]): number[] {
  return values.map((row) => row.reduce((sum, value, columnIndex) => sum + value * vector[columnIndex]!, 0));
}

function subtractVectors(left: number[], right: number[]): number[] {
  return left.map((value, index) => value - right[index]!);
}
