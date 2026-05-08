import { describe, expect, test } from "bun:test";
import {
  StorageValidationError,
  assertBrightness,
  assertTraits,
  validateMemoryInput,
  validatePersonalityInput,
} from "#/validation";

describe("validation", () => {
  test("accepts brightness in bounds", () => {
    expect(assertBrightness(0)).toBe(0);
    expect(assertBrightness(1)).toBe(1);
  });

  test("rejects out-of-range brightness", () => {
    expect(() => assertBrightness(-0.01)).toThrow(StorageValidationError);
    expect(() => assertBrightness(1.01)).toThrow(StorageValidationError);
  });

  test("accepts valid traits", () => {
    const traits = { warmth: 0.7, directness: 0.4 };
    expect(assertTraits(traits)).toEqual(traits);
  });

  test("rejects invalid trait values", () => {
    expect(() => assertTraits({ warmth: -0.1 })).toThrow(StorageValidationError);
    expect(() => assertTraits({ warmth: 1.1 })).toThrow(StorageValidationError);
  });

  test("rejects empty memory description", () => {
    expect(() =>
      validateMemoryInput({
        whatHappened: "   ",
        brightness: 0.5,
        happenedAt: new Date().toISOString(),
      }),
    ).toThrow(StorageValidationError);
  });

  test("normalizes personality input", () => {
    const output = validatePersonalityInput({
      basePersonaText: "  Friendly mentor  ",
      traits: { warmth: 0.8 },
      constraints: ["  be honest  ", ""],
    });

    expect(output.basePersonaText).toBe("Friendly mentor");
    expect(output.traits).toEqual({ warmth: 0.8 });
    expect(output.constraints).toEqual(["be honest"]);
  });
});
