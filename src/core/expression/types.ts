import type { ComputationIssue } from "@core/contracts";

export interface SourceSpan {
  start: number;
  end: number;
}

export type TokenType =
  | "number"
  | "identifier"
  | "plus"
  | "minus"
  | "star"
  | "slash"
  | "caret"
  | "leftParen"
  | "rightParen"
  | "comma"
  | "eof";

export interface Token extends SourceSpan {
  type: TokenType;
  lexeme: string;
}

export interface NumberLiteralNode {
  kind: "number";
  value: string;
  span: SourceSpan;
}

export interface IdentifierNode {
  kind: "identifier";
  name: string;
  span: SourceSpan;
}

export interface UnaryExpressionNode {
  kind: "unary";
  operator: "+" | "-";
  operand: AstNode;
  span: SourceSpan;
}

export interface BinaryExpressionNode {
  kind: "binary";
  operator: "+" | "-" | "*" | "/" | "^";
  left: AstNode;
  right: AstNode;
  span: SourceSpan;
}

export interface CallExpressionNode {
  kind: "call";
  callee: string;
  args: AstNode[];
  span: SourceSpan;
}

export type AstNode =
  | NumberLiteralNode
  | IdentifierNode
  | UnaryExpressionNode
  | BinaryExpressionNode
  | CallExpressionNode;

export interface TokenizeResult {
  tokens: Token[];
  issues: ComputationIssue[];
}

export interface ParseResult {
  ast: AstNode | null;
  issues: ComputationIssue[];
}
