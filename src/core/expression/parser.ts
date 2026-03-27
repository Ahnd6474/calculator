import type { ComputationIssue } from "@core/contracts";
import type {
  AstNode,
  BinaryExpressionNode,
  CallExpressionNode,
  ParseResult,
  Token,
  UnaryExpressionNode
} from "./types";

export function parseTokens(tokens: Token[]): ParseResult {
  const parser = new ExpressionParser(tokens);
  return parser.parse();
}

class ExpressionParser {
  private readonly issues: ComputationIssue[] = [];
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ParseResult {
    const ast = this.parseExpression();

    if (ast && !this.check("eof")) {
      const token = this.peek();
      this.issues.push(
        createExpressionIssue("expression.trailing_tokens", `Unexpected token '${token.lexeme}'.`)
      );
    }

    return {
      ast,
      issues: this.issues
    };
  }

  private parseExpression(): AstNode | null {
    return this.parseAdditive();
  }

  private parseAdditive(): AstNode | null {
    let expression = this.parseMultiplicative();

    while (this.match("plus", "minus")) {
      const operator = this.previous();
      const right = this.parseMultiplicative();
      if (!expression || !right) {
        return expression ?? right;
      }

      const binary: BinaryExpressionNode = {
        kind: "binary",
        operator: operator.type === "plus" ? "+" : "-",
        left: expression,
        right,
        span: {
          start: expression.span.start,
          end: right.span.end
        }
      };
      expression = binary;
    }

    return expression;
  }

  private parseMultiplicative(): AstNode | null {
    let expression = this.parsePower();

    while (this.match("star", "slash")) {
      const operator = this.previous();
      const right = this.parsePower();
      if (!expression || !right) {
        return expression ?? right;
      }

      const binary: BinaryExpressionNode = {
        kind: "binary",
        operator: operator.type === "star" ? "*" : "/",
        left: expression,
        right,
        span: {
          start: expression.span.start,
          end: right.span.end
        }
      };
      expression = binary;
    }

    return expression;
  }

  private parsePower(): AstNode | null {
    const base = this.parseUnary();

    if (!base) {
      return null;
    }

    if (!this.match("caret")) {
      return base;
    }

    const right = this.parsePower();
    if (!right) {
      return base;
    }

    const binary: BinaryExpressionNode = {
      kind: "binary",
      operator: "^",
      left: base,
      right,
      span: {
        start: base.span.start,
        end: right.span.end
      }
    };

    return binary;
  }

  private parseUnary(): AstNode | null {
    if (this.match("plus", "minus")) {
      const operator = this.previous();
      const operand = this.parseUnary();

      if (!operand) {
        return null;
      }

      const unary: UnaryExpressionNode = {
        kind: "unary",
        operator: operator.type === "plus" ? "+" : "-",
        operand,
        span: {
          start: operator.start,
          end: operand.span.end
        }
      };

      return unary;
    }

    return this.parsePrimary();
  }

  private parsePrimary(): AstNode | null {
    if (this.match("number")) {
      const token = this.previous();
      return {
        kind: "number",
        value: token.lexeme,
        span: {
          start: token.start,
          end: token.end
        }
      };
    }

    if (this.match("identifier")) {
      const identifier = this.previous();
      if (this.match("leftParen")) {
        const args: AstNode[] = [];

        if (!this.check("rightParen")) {
          do {
            const argument = this.parseExpression();
            if (!argument) {
              return null;
            }

            args.push(argument);
          } while (this.match("comma"));
        }

        const closingParen = this.consume("rightParen", "Expected ')' after function arguments.");
        if (!closingParen) {
          return null;
        }

        const call: CallExpressionNode = {
          kind: "call",
          callee: identifier.lexeme,
          args,
          span: {
            start: identifier.start,
            end: closingParen.end
          }
        };

        return call;
      }

      return {
        kind: "identifier",
        name: identifier.lexeme,
        span: {
          start: identifier.start,
          end: identifier.end
        }
      };
    }

    if (this.match("leftParen")) {
      const leftParen = this.previous();
      const expression = this.parseExpression();
      const closingParen = this.consume("rightParen", "Expected ')' after grouped expression.");

      if (!expression || !closingParen) {
        return null;
      }

      return {
        ...expression,
        span: {
          start: leftParen.start,
          end: closingParen.end
        }
      };
    }

    const token = this.peek();
    this.issues.push(
      createExpressionIssue("expression.expected_operand", `Expected a number, identifier, or '('. Found '${token.lexeme || "end of input"}'.`)
    );
    return null;
  }

  private consume(type: Token["type"], message: string): Token | null {
    if (this.check(type)) {
      return this.advance();
    }

    this.issues.push(createExpressionIssue("expression.syntax", message));
    return null;
  }

  private match(...types: Token["type"][]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }

    return false;
  }

  private check(type: Token["type"]): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.index += 1;
    }

    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.peek().type === "eof";
  }

  private peek(): Token {
    const token = this.tokens[this.index] ?? this.tokens[this.tokens.length - 1];
    if (!token) {
      throw new Error("Expression parser requires at least one token.");
    }

    return token;
  }

  private previous(): Token {
    const token = this.tokens[this.index - 1] ?? this.tokens[0];
    if (!token) {
      throw new Error("Expression parser requires at least one token.");
    }

    return token;
  }
}

function createExpressionIssue(code: string, message: string): ComputationIssue {
  return {
    code,
    message,
    severity: "error",
    field: "expression"
  };
}
