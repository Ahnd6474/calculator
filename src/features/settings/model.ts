import type { AngleMode, CalculatorSettings, DisplayMode, NumericBackend } from "@core/contracts";

export const BACKEND_OPTIONS: NumericBackend[] = ["float64", "decimal"];
export const ANGLE_MODE_OPTIONS: AngleMode[] = ["radian", "degree"];
export const DISPLAY_MODE_OPTIONS: DisplayMode[] = ["normal", "scientific", "engineering"];

export const SETTINGS_LIMITS = {
  displayPrecision: { min: 2, max: 24 },
  internalPrecision: { min: 16, max: 128 },
  solverTolerance: { min: 1e-15, max: 1e-3 },
  maxIterations: { min: 5, max: 1000 }
} as const;

export function createDefaultCalculatorSettings(): CalculatorSettings {
  return {
    numeric: {
      backend: "float64",
      displayPrecision: 12,
      internalPrecision: 28,
      solverTolerance: 1e-10,
      maxIterations: 100,
      angleMode: "radian",
      displayMode: "normal"
    },
    locale: "en-US"
  };
}

export function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function clampNumber(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}

export function sanitizeCalculatorSettings(settings: CalculatorSettings): CalculatorSettings {
  const defaults = createDefaultCalculatorSettings();

  return {
    locale: settings.locale.trim() || defaults.locale,
    numeric: {
      backend: BACKEND_OPTIONS.includes(settings.numeric.backend) ? settings.numeric.backend : defaults.numeric.backend,
      displayPrecision: clampInteger(
        settings.numeric.displayPrecision,
        SETTINGS_LIMITS.displayPrecision.min,
        SETTINGS_LIMITS.displayPrecision.max
      ),
      internalPrecision: clampInteger(
        settings.numeric.internalPrecision,
        SETTINGS_LIMITS.internalPrecision.min,
        SETTINGS_LIMITS.internalPrecision.max
      ),
      solverTolerance: clampNumber(
        settings.numeric.solverTolerance,
        SETTINGS_LIMITS.solverTolerance.min,
        SETTINGS_LIMITS.solverTolerance.max
      ),
      maxIterations: clampInteger(
        settings.numeric.maxIterations,
        SETTINGS_LIMITS.maxIterations.min,
        SETTINGS_LIMITS.maxIterations.max
      ),
      angleMode: ANGLE_MODE_OPTIONS.includes(settings.numeric.angleMode)
        ? settings.numeric.angleMode
        : defaults.numeric.angleMode,
      displayMode: DISPLAY_MODE_OPTIONS.includes(settings.numeric.displayMode)
        ? settings.numeric.displayMode
        : defaults.numeric.displayMode
    }
  };
}
