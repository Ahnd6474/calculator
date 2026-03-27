import type { ExpressionRequest } from "@core/contracts";
import type { NumericRuntime } from "@core/precision";
import { compileExpression, toComputationIssue } from "./compiler";
import { parseTokens } from "./parser";
import { tokenizeExpression } from "./tokenizer";

export { parseTokens } from "./parser";
export { tokenizeExpression } from "./tokenizer";
export type { AstNode, ParseResult, Token, TokenizeResult } from "./types";

export interface PreparedExpression<TValue> {
  canonicalExpression: string;
  issues: ReturnType<typeof toComputationIssue>[];
  evaluate: (() => TValue) | null;
}

export function prepareExpression<TValue>(
  request: ExpressionRequest,
  runtime: NumericRuntime<TValue>
): PreparedExpression<TValue> {
  const tokenized = tokenizeExpression(request.expression);
  if (tokenized.issues.length > 0) {
    return {
      canonicalExpression: request.expression.trim(),
      issues: tokenized.issues,
      evaluate: null
    };
  }

  const parsed = parseTokens(tokenized.tokens);
  if (!parsed.ast || parsed.issues.length > 0) {
    return {
      canonicalExpression: request.expression.trim(),
      issues: parsed.issues,
      evaluate: null
    };
  }

  const compiled = compileExpression(parsed.ast, runtime, request);
  if (compiled.issues.length > 0) {
    return {
      canonicalExpression: compiled.canonicalExpression,
      issues: compiled.issues,
      evaluate: null
    };
  }

  return {
    canonicalExpression: compiled.canonicalExpression,
    issues: [],
    evaluate: compiled.evaluate
  };
}
