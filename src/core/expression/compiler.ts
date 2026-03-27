import type { ComputationIssue, ExpressionRequest, NumericSettings } from "@core/contracts";
import type { NumericRuntime } from "@core/precision";
import type { AstNode } from "./types";

export interface CompilationResult<TValue> {
  evaluate: () => TValue;
  canonicalExpression: string;
  issues: ComputationIssue[];
}

class EvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field = "expression"
  ) {
    super(message);
  }
}

type CompiledNode<TValue> = () => TValue;

interface FunctionSpec<TValue> {
  minArgs: number;
  maxArgs: number;
  evaluate(args: TValue[], context: EvaluationContext<TValue>): TValue;
}

interface EvaluationContext<TValue> {
  runtime: NumericRuntime<TValue>;
  settings: NumericSettings;
}

export function compileExpression<TValue>(
  ast: AstNode,
  runtime: NumericRuntime<TValue>,
  request: ExpressionRequest
): CompilationResult<TValue> {
  const issues: ComputationIssue[] = [];
  const context: EvaluationContext<TValue> = {
    runtime,
    settings: request.settings.numeric
  };
  const variables = request.variables ?? {};
  const compiled = compileNode(ast, runtime, context, variables, issues);

  return {
    evaluate: compiled ?? (() => runtime.zero),
    canonicalExpression: printAst(ast),
    issues
  };
}

export function toComputationIssue(error: unknown): ComputationIssue {
  if (error instanceof EvaluationError) {
    return {
      code: error.code,
      message: error.message,
      severity: "error",
      field: error.field
    };
  }

  if (error instanceof Error) {
    return {
      code: "expression.evaluation_failed",
      message: error.message,
      severity: "error",
      field: "expression"
    };
  }

  return {
    code: "expression.evaluation_failed",
    message: "Evaluation failed.",
    severity: "error",
    field: "expression"
  };
}

function compileNode<TValue>(
  node: AstNode,
  runtime: NumericRuntime<TValue>,
  context: EvaluationContext<TValue>,
  variables: Record<string, number | string>,
  issues: ComputationIssue[]
): CompiledNode<TValue> | null {
  switch (node.kind) {
    case "number":
      return () => runtime.fromString(node.value);

    case "identifier": {
      const constant = resolveConstant(node.name, runtime);
      if (constant) {
        return () => constant();
      }

      if (Object.prototype.hasOwnProperty.call(variables, node.name)) {
        return () => coerceVariable(variables[node.name], runtime);
      }

      issues.push(
        createExpressionIssue(
          "expression.unknown_identifier",
          `Unknown identifier '${node.name}'.`
        )
      );
      return null;
    }

    case "unary": {
      const operand = compileNode(node.operand, runtime, context, variables, issues);
      if (!operand) {
        return null;
      }

      if (node.operator === "+") {
        return operand;
      }

      return () => runtime.negate(operand());
    }

    case "binary": {
      const left = compileNode(node.left, runtime, context, variables, issues);
      const right = compileNode(node.right, runtime, context, variables, issues);

      if (!left || !right) {
        return null;
      }

      switch (node.operator) {
        case "+":
          return () => runtime.add(left(), right());
        case "-":
          return () => runtime.subtract(left(), right());
        case "*":
          return () => runtime.multiply(left(), right());
        case "/":
          return () => {
            const denominator = right();
            if (runtime.isZero(denominator)) {
              throw new EvaluationError("math.division_by_zero", "Division by zero is undefined.");
            }

            return runtime.divide(left(), denominator);
          };
        case "^":
          return () => runtime.power(left(), right());
      }
      break;
    }

    case "call": {
      const functionSpec = buildFunctionLibrary(runtime).get(node.callee.toLowerCase());
      if (!functionSpec) {
        issues.push(
          createExpressionIssue("expression.unknown_function", `Unknown function '${node.callee}'.`)
        );
        return null;
      }

      if (node.args.length < functionSpec.minArgs || node.args.length > functionSpec.maxArgs) {
        issues.push(
          createExpressionIssue(
            "expression.invalid_arity",
            `Function '${node.callee}' expects ${describeArity(functionSpec.minArgs, functionSpec.maxArgs)}.`
          )
        );
        return null;
      }

      const compiledArgs = node.args
        .map((arg) => compileNode(arg, runtime, context, variables, issues))
        .filter((value): value is CompiledNode<TValue> => value !== null);

      if (compiledArgs.length !== node.args.length) {
        return null;
      }

      return () => {
        const args = compiledArgs.map((evaluate) => evaluate());
        return functionSpec.evaluate(args, context);
      };
    }
  }
}

function resolveConstant<TValue>(
  name: string,
  runtime: NumericRuntime<TValue>
): (() => TValue) | null {
  switch (name.toLowerCase()) {
    case "pi":
      return () => runtime.pi();
    case "e":
      return () => runtime.e();
    default:
      return null;
  }
}

function coerceVariable<TValue>(
  value: number | string | undefined,
  runtime: NumericRuntime<TValue>
): TValue {
  if (typeof value === "number") {
    return runtime.fromNumber(value);
  }

  if (typeof value === "string") {
    return runtime.fromString(value);
  }

  throw new EvaluationError("expression.unknown_identifier", "Unknown identifier.");
}

function buildFunctionLibrary<TValue>(
  runtime: NumericRuntime<TValue>
): Map<string, FunctionSpec<TValue>> {
  const toRadians = (value: TValue) =>
    runtime.multiply(value, runtime.divide(runtime.pi(), runtime.fromNumber(180)));
  const fromRadians = (value: TValue) =>
    runtime.multiply(value, runtime.divide(runtime.fromNumber(180), runtime.pi()));

  const withFiniteCheck = (value: TValue, message: string) => {
    if (!runtime.isFinite(value)) {
      throw new EvaluationError("math.domain_error", message);
    }

    return value;
  };

  const unary = (
    evaluator: (value: TValue) => TValue,
    domainMessage = "The operation is outside the supported domain."
  ): FunctionSpec<TValue> => ({
    minArgs: 1,
    maxArgs: 1,
    evaluate(args) {
      return withFiniteCheck(evaluator(getArg(args, 0)), domainMessage);
    }
  });

  const library = new Map<string, FunctionSpec<TValue>>();

  library.set("sin", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = getArg(args, 0);
      const input = context.settings.angleMode === "degree" ? toRadians(value) : value;
      return withFiniteCheck(runtime.sin(input), "sin is undefined for the provided input.");
    }
  });
  library.set("cos", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = getArg(args, 0);
      const input = context.settings.angleMode === "degree" ? toRadians(value) : value;
      return withFiniteCheck(runtime.cos(input), "cos is undefined for the provided input.");
    }
  });
  library.set("tan", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = getArg(args, 0);
      const input = context.settings.angleMode === "degree" ? toRadians(value) : value;
      return withFiniteCheck(runtime.tan(input), "tan is undefined for the provided input.");
    }
  });
  library.set("asin", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = withFiniteCheck(runtime.asin(getArg(args, 0)), "asin is defined only on [-1, 1].");
      return context.settings.angleMode === "degree" ? fromRadians(value) : value;
    }
  });
  library.set("acos", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = withFiniteCheck(runtime.acos(getArg(args, 0)), "acos is defined only on [-1, 1].");
      return context.settings.angleMode === "degree" ? fromRadians(value) : value;
    }
  });
  library.set("atan", {
    minArgs: 1,
    maxArgs: 1,
    evaluate(args, context) {
      const value = withFiniteCheck(runtime.atan(getArg(args, 0)), "atan is undefined for the provided input.");
      return context.settings.angleMode === "degree" ? fromRadians(value) : value;
    }
  });
  library.set("sinh", unary((value) => runtime.sinh(value)));
  library.set("cosh", unary((value) => runtime.cosh(value)));
  library.set("tanh", unary((value) => runtime.tanh(value)));
  library.set("exp", unary((value) => runtime.exp(value)));
  library.set("ln", unary((value) => runtime.ln(value), "ln is defined only for positive values."));
  library.set("log10", unary((value) => runtime.log10(value), "log10 is defined only for positive values."));
  library.set("log", {
    minArgs: 1,
    maxArgs: 2,
    evaluate(args) {
      if (args.length === 1) {
        return withFiniteCheck(runtime.log10(getArg(args, 0)), "log is defined only for positive values.");
      }

      const numerator = runtime.ln(getArg(args, 0));
      const denominator = runtime.ln(getArg(args, 1));
      if (runtime.isZero(denominator)) {
        throw new EvaluationError("math.domain_error", "log base cannot be 1.");
      }

      return withFiniteCheck(runtime.divide(numerator, denominator), "Invalid logarithm arguments.");
    }
  });
  library.set("sqrt", unary((value) => runtime.sqrt(value), "sqrt is defined only for non-negative values."));
  library.set("cbrt", unary((value) => runtime.cbrt(value)));
  library.set("abs", unary((value) => runtime.abs(value)));
  library.set("floor", unary((value) => runtime.floor(value)));
  library.set("ceil", unary((value) => runtime.ceil(value)));
  library.set("round", unary((value) => runtime.round(value)));

  return library;
}

function describeArity(minArgs: number, maxArgs: number): string {
  if (minArgs === maxArgs) {
    return `${minArgs} argument${minArgs === 1 ? "" : "s"}`;
  }

  return `${minArgs}-${maxArgs} arguments`;
}

function printAst(node: AstNode, parentPrecedence = 0): string {
  switch (node.kind) {
    case "number":
      return node.value;
    case "identifier":
      return node.name;
    case "call":
      return `${node.callee}(${node.args.map((arg) => printAst(arg)).join(", ")})`;
    case "unary": {
      const rendered = `${node.operator}${printAst(node.operand, 4)}`;
      return parentPrecedence > 4 ? `(${rendered})` : rendered;
    }
    case "binary": {
      const precedence = getPrecedence(node.operator);
      const left = printAst(node.left, precedence);
      const right = printAst(node.right, node.operator === "^" ? precedence - 1 : precedence);
      const rendered = `${left} ${node.operator} ${right}`;
      return precedence < parentPrecedence ? `(${rendered})` : rendered;
    }
  }
}

function getPrecedence(operator: "+" | "-" | "*" | "/" | "^"): number {
  switch (operator) {
    case "+":
    case "-":
      return 1;
    case "*":
    case "/":
      return 2;
    case "^":
      return 3;
  }
}

function getArg<TValue>(args: TValue[], index: number): TValue {
  const value = args[index];
  if (value === undefined) {
    throw new EvaluationError("expression.invalid_arity", "Function received an invalid argument list.");
  }

  return value;
}

function createExpressionIssue(code: string, message: string): ComputationIssue {
  return {
    code,
    message,
    severity: "error",
    field: "expression"
  };
}
