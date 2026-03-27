import type { ComputationIssue } from "@core/contracts";
import type { Token, TokenizeResult, TokenType } from "./types";

const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*/;

const SINGLE_CHAR_TOKENS: Record<string, TokenType> = {
  "+": "plus",
  "-": "minus",
  "*": "star",
  "/": "slash",
  "^": "caret",
  "(": "leftParen",
  ")": "rightParen",
  ",": "comma"
};

export function tokenizeExpression(source: string): TokenizeResult {
  const tokens: Token[] = [];
  const issues: ComputationIssue[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const current = source[cursor];

    if (!current) {
      break;
    }

    if (/\s/.test(current)) {
      cursor += 1;
      continue;
    }

    const numberMatch = source.slice(cursor).match(NUMBER_PATTERN);
    if (numberMatch) {
      const lexeme = numberMatch[0];
      tokens.push({
        type: "number",
        lexeme,
        start: cursor,
        end: cursor + lexeme.length
      });
      cursor += lexeme.length;
      continue;
    }

    const identifierMatch = source.slice(cursor).match(IDENTIFIER_PATTERN);
    if (identifierMatch) {
      const lexeme = identifierMatch[0];
      tokens.push({
        type: "identifier",
        lexeme,
        start: cursor,
        end: cursor + lexeme.length
      });
      cursor += lexeme.length;
      continue;
    }

    const tokenType = SINGLE_CHAR_TOKENS[current];
    if (tokenType) {
      tokens.push({
        type: tokenType,
        lexeme: current,
        start: cursor,
        end: cursor + 1
      });
      cursor += 1;
      continue;
    }

    issues.push(createExpressionIssue("expression.invalid_character", `Unsupported character '${current}'.`));
    cursor += 1;
  }

  tokens.push({
    type: "eof",
    lexeme: "",
    start: source.length,
    end: source.length
  });

  return {
    tokens,
    issues
  };
}

function createExpressionIssue(code: string, message: string): ComputationIssue {
  return {
    code,
    message,
    severity: "error",
    field: "expression"
  };
}
