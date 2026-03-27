import Decimal from "decimal.js";
import type { DisplayMode, NumericBackend, NumericSettings } from "@core/contracts";

const MAX_DISPLAY_PRECISION = 32;
const MAX_INTERNAL_PRECISION = 128;
const MIN_DISPLAY_PRECISION = 1;
const MIN_INTERNAL_PRECISION = 8;

export interface NumericRuntime<TValue> {
  readonly backend: NumericBackend;
  readonly internalPrecision: number;
  readonly displayPrecision: number;
  readonly zero: TValue;
  readonly one: TValue;
  readonly ten: TValue;
  fromString(value: string): TValue;
  fromNumber(value: number): TValue;
  toNumber(value: TValue): number;
  toDisplayString(value: TValue, mode: DisplayMode, digits: number): string;
  toScientificString(value: TValue, digits: number): string;
  abs(value: TValue): TValue;
  negate(value: TValue): TValue;
  add(left: TValue, right: TValue): TValue;
  subtract(left: TValue, right: TValue): TValue;
  multiply(left: TValue, right: TValue): TValue;
  divide(left: TValue, right: TValue): TValue;
  power(left: TValue, right: TValue): TValue;
  sqrt(value: TValue): TValue;
  cbrt(value: TValue): TValue;
  exp(value: TValue): TValue;
  ln(value: TValue): TValue;
  log10(value: TValue): TValue;
  floor(value: TValue): TValue;
  ceil(value: TValue): TValue;
  round(value: TValue): TValue;
  sin(value: TValue): TValue;
  cos(value: TValue): TValue;
  tan(value: TValue): TValue;
  asin(value: TValue): TValue;
  acos(value: TValue): TValue;
  atan(value: TValue): TValue;
  sinh(value: TValue): TValue;
  cosh(value: TValue): TValue;
  tanh(value: TValue): TValue;
  pi(): TValue;
  e(): TValue;
  isFinite(value: TValue): boolean;
  isInteger(value: TValue): boolean;
  isZero(value: TValue): boolean;
}

export function clampDisplayPrecision(value: number): number {
  return clampNumber(value, MIN_DISPLAY_PRECISION, MAX_DISPLAY_PRECISION, 12);
}

export function clampInternalPrecision(value: number): number {
  return clampNumber(value, MIN_INTERNAL_PRECISION, MAX_INTERNAL_PRECISION, 28);
}

export function normalizeNumericSettings(settings: NumericSettings): NumericSettings {
  return {
    ...settings,
    displayPrecision: clampDisplayPrecision(settings.displayPrecision),
    internalPrecision: clampInternalPrecision(settings.internalPrecision),
    solverTolerance: Number.isFinite(settings.solverTolerance) && settings.solverTolerance > 0
      ? settings.solverTolerance
      : 1e-10,
    maxIterations: clampNumber(settings.maxIterations, 1, 100_000, 100)
  };
}

export function createFloat64Runtime(settings: NumericSettings): NumericRuntime<number> {
  const normalized = normalizeNumericSettings(settings);

  return {
    backend: "float64",
    internalPrecision: normalized.internalPrecision,
    displayPrecision: normalized.displayPrecision,
    zero: 0,
    one: 1,
    ten: 10,
    fromString(value) {
      return Number(value);
    },
    fromNumber(value) {
      return value;
    },
    toNumber(value) {
      return value;
    },
    toDisplayString(value, mode, digits) {
      return formatFloat(value, mode, clampDisplayPrecision(digits));
    },
    toScientificString(value, digits) {
      return formatScientificNumber(value, clampDisplayPrecision(digits));
    },
    abs(value) {
      return Math.abs(value);
    },
    negate(value) {
      return -value;
    },
    add(left, right) {
      return left + right;
    },
    subtract(left, right) {
      return left - right;
    },
    multiply(left, right) {
      return left * right;
    },
    divide(left, right) {
      return left / right;
    },
    power(left, right) {
      return Math.pow(left, right);
    },
    sqrt(value) {
      return Math.sqrt(value);
    },
    cbrt(value) {
      return Math.cbrt(value);
    },
    exp(value) {
      return Math.exp(value);
    },
    ln(value) {
      return Math.log(value);
    },
    log10(value) {
      return Math.log10(value);
    },
    floor(value) {
      return Math.floor(value);
    },
    ceil(value) {
      return Math.ceil(value);
    },
    round(value) {
      return Math.round(value);
    },
    sin(value) {
      return Math.sin(value);
    },
    cos(value) {
      return Math.cos(value);
    },
    tan(value) {
      return Math.tan(value);
    },
    asin(value) {
      return Math.asin(value);
    },
    acos(value) {
      return Math.acos(value);
    },
    atan(value) {
      return Math.atan(value);
    },
    sinh(value) {
      return Math.sinh(value);
    },
    cosh(value) {
      return Math.cosh(value);
    },
    tanh(value) {
      return Math.tanh(value);
    },
    pi() {
      return Math.PI;
    },
    e() {
      return Math.E;
    },
    isFinite(value) {
      return Number.isFinite(value);
    },
    isInteger(value) {
      return Number.isInteger(value);
    },
    isZero(value) {
      return value === 0;
    }
  };
}

export function createDecimalRuntime(settings: NumericSettings): NumericRuntime<Decimal> {
  const normalized = normalizeNumericSettings(settings);
  const DecimalCtor = Decimal.clone({
    precision: normalized.internalPrecision,
    rounding: Decimal.ROUND_HALF_UP,
    toExpNeg: -1_000,
    toExpPos: 1_000
  });

  const zero = new DecimalCtor(0);
  const one = new DecimalCtor(1);
  const ten = new DecimalCtor(10);

  return {
    backend: "decimal",
    internalPrecision: normalized.internalPrecision,
    displayPrecision: normalized.displayPrecision,
    zero,
    one,
    ten,
    fromString(value) {
      return new DecimalCtor(value);
    },
    fromNumber(value) {
      return new DecimalCtor(value);
    },
    toNumber(value) {
      return value.toNumber();
    },
    toDisplayString(value, mode, digits) {
      return formatDecimal(value, mode, clampDisplayPrecision(digits), ten);
    },
    toScientificString(value, digits) {
      return formatScientificDecimal(value, clampDisplayPrecision(digits));
    },
    abs(value) {
      return value.abs();
    },
    negate(value) {
      return value.negated();
    },
    add(left, right) {
      return left.plus(right);
    },
    subtract(left, right) {
      return left.minus(right);
    },
    multiply(left, right) {
      return left.times(right);
    },
    divide(left, right) {
      return left.div(right);
    },
    power(left, right) {
      return left.pow(right);
    },
    sqrt(value) {
      return value.sqrt();
    },
    cbrt(value) {
      return value.cbrt();
    },
    exp(value) {
      return value.exp();
    },
    ln(value) {
      return value.ln();
    },
    log10(value) {
      return value.log(10);
    },
    floor(value) {
      return value.floor();
    },
    ceil(value) {
      return value.ceil();
    },
    round(value) {
      return value.round();
    },
    sin(value) {
      return value.sin();
    },
    cos(value) {
      return value.cos();
    },
    tan(value) {
      return value.tan();
    },
    asin(value) {
      return value.asin();
    },
    acos(value) {
      return value.acos();
    },
    atan(value) {
      return value.atan();
    },
    sinh(value) {
      return value.sinh();
    },
    cosh(value) {
      return value.cosh();
    },
    tanh(value) {
      return value.tanh();
    },
    pi() {
      return new DecimalCtor(-1).acos();
    },
    e() {
      return new DecimalCtor(1).exp();
    },
    isFinite(value) {
      return value.isFinite();
    },
    isInteger(value) {
      return value.isInteger();
    },
    isZero(value) {
      return value.isZero();
    }
  };
}

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.trunc(value), min), max);
}

function formatFloat(value: number, mode: DisplayMode, digits: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }

  if (mode === "scientific") {
    return formatScientificNumber(value, digits);
  }

  if (mode === "engineering") {
    return formatEngineeringNumber(value, digits);
  }

  return stripTrailingZeros(value.toPrecision(digits));
}

function formatScientificNumber(value: number, digits: number): string {
  if (value === 0) {
    return "0";
  }

  return normalizeExponent(stripTrailingZeros(value.toExponential(Math.max(digits - 1, 0))));
}

function formatEngineeringNumber(value: number, digits: number): string {
  if (value === 0) {
    return "0";
  }

  const absolute = Math.abs(value);
  const exponent = Math.floor(Math.log10(absolute));
  let engineeringExponent = Math.floor(exponent / 3) * 3;
  let scaled = value / 10 ** engineeringExponent;
  let integerDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled))) + 1);
  let decimalPlaces = Math.max(digits - integerDigits, 0);
  let mantissa = Number(scaled.toFixed(decimalPlaces));

  if (Math.abs(mantissa) >= 1_000) {
    engineeringExponent += 3;
    scaled = value / 10 ** engineeringExponent;
    integerDigits = Math.max(1, Math.floor(Math.log10(Math.abs(scaled))) + 1);
    decimalPlaces = Math.max(digits - integerDigits, 0);
    mantissa = Number(scaled.toFixed(decimalPlaces));
  }

  return `${stripTrailingZeros(mantissa.toFixed(decimalPlaces))}${formatExponent(engineeringExponent)}`;
}

function formatDecimal(value: Decimal, mode: DisplayMode, digits: number, ten: Decimal): string {
  if (!value.isFinite()) {
    return value.toString();
  }

  if (mode === "scientific") {
    return formatScientificDecimal(value, digits);
  }

  if (mode === "engineering") {
    return formatEngineeringDecimal(value, digits, ten);
  }

  return stripTrailingZeros(value.toSD(digits).toString());
}

function formatScientificDecimal(value: Decimal, digits: number): string {
  if (value.isZero()) {
    return "0";
  }

  return normalizeExponent(stripTrailingZeros(value.toExponential(Math.max(digits - 1, 0))));
}

function formatEngineeringDecimal(value: Decimal, digits: number, ten: Decimal): string {
  if (value.isZero()) {
    return "0";
  }

  const scientific = value.toExponential(Math.max(digits + 2, 4));
  const exponentMatch = scientific.match(/e([+-]?\d+)$/);
  const exponent = exponentMatch ? Number(exponentMatch[1]) : 0;
  let engineeringExponent = Math.floor(exponent / 3) * 3;
  let scaled = value.div(ten.pow(engineeringExponent));
  let integerDigits = Math.max(1, exponent - engineeringExponent + 1);
  let decimalPlaces = Math.max(digits - integerDigits, 0);
  let mantissa = scaled.toDecimalPlaces(decimalPlaces);

  if (mantissa.abs().gte(1_000)) {
    engineeringExponent += 3;
    scaled = value.div(ten.pow(engineeringExponent));
    integerDigits = Math.max(1, exponent - engineeringExponent + 1);
    decimalPlaces = Math.max(digits - integerDigits, 0);
    mantissa = scaled.toDecimalPlaces(decimalPlaces);
  }

  return `${stripTrailingZeros(mantissa.toFixed(decimalPlaces))}${formatExponent(engineeringExponent)}`;
}

function stripTrailingZeros(text: string): string {
  if (!text.includes(".")) {
    return text;
  }

  return text
    .replace(/(\.\d*?[1-9])0+(e[+-]?\d+)?$/i, "$1$2")
    .replace(/\.0+(e[+-]?\d+)?$/i, "$1")
    .replace(/e([+-]?\d+)$/i, (_, exponent: string) => formatExponent(Number(exponent)).slice(1));
}

function normalizeExponent(text: string): string {
  return text.replace(/e([+-]?\d+)$/i, (_, exponent: string) => formatExponent(Number(exponent)).slice(1));
}

function formatExponent(exponent: number): string {
  return `e${exponent >= 0 ? "+" : ""}${exponent}`;
}
