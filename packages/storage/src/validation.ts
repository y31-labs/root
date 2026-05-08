import type {
  CreateMemoryHighlightInput,
  PersonalityTraits,
  UpdatePersonalityInput,
} from "#/types";

export const MIN_BRIGHTNESS = 0;
export const MAX_BRIGHTNESS = 1;
export const MIN_TRAIT_VALUE = 0;
export const MAX_TRAIT_VALUE = 1;
export const DEFAULT_PROFILE_ID = "default";
export const MAX_MEMORY_LENGTH = 1_000;
export const MAX_PERSONA_LENGTH = 4_000;
export const MAX_CONSTRAINTS = 25;

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageValidationError";
  }
}

export const assertBrightness = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new StorageValidationError("Brightness must be a finite number");
  }
  if (value < MIN_BRIGHTNESS || value > MAX_BRIGHTNESS) {
    throw new StorageValidationError(
      `Brightness must be between ${MIN_BRIGHTNESS} and ${MAX_BRIGHTNESS}`,
    );
  }
  return value;
};

export const assertTraits = (traits: PersonalityTraits): PersonalityTraits => {
  for (const [name, value] of Object.entries(traits)) {
    if (!name.trim()) {
      throw new StorageValidationError("Trait names must not be empty");
    }
    if (!Number.isFinite(value)) {
      throw new StorageValidationError(`Trait "${name}" must be a finite number`);
    }
    if (value < MIN_TRAIT_VALUE || value > MAX_TRAIT_VALUE) {
      throw new StorageValidationError(
        `Trait "${name}" must be between ${MIN_TRAIT_VALUE} and ${MAX_TRAIT_VALUE}`,
      );
    }
  }
  return traits;
};

export const normalizeDate = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new StorageValidationError("Invalid date value");
  }
  return date.toISOString();
};

export const validateMemoryInput = (
  input: CreateMemoryHighlightInput,
): CreateMemoryHighlightInput => {
  const whatHappened = input.whatHappened.trim();
  if (!whatHappened) {
    throw new StorageValidationError("whatHappened is required");
  }
  if (whatHappened.length > MAX_MEMORY_LENGTH) {
    throw new StorageValidationError(
      `whatHappened must be <= ${MAX_MEMORY_LENGTH} characters`,
    );
  }
  assertBrightness(input.brightness);

  return {
    ...input,
    whatHappened,
    tags: input.tags?.filter((tag) => tag.trim().length > 0),
    source: input.source?.trim() || undefined,
  };
};

export const validatePersonalityInput = (
  input: UpdatePersonalityInput,
): UpdatePersonalityInput => {
  const normalized: UpdatePersonalityInput = { ...input };

  if (normalized.basePersonaText !== undefined) {
    const text = normalized.basePersonaText.trim();
    if (!text) {
      throw new StorageValidationError("basePersonaText cannot be empty");
    }
    if (text.length > MAX_PERSONA_LENGTH) {
      throw new StorageValidationError(
        `basePersonaText must be <= ${MAX_PERSONA_LENGTH} characters`,
      );
    }
    normalized.basePersonaText = text;
  }

  if (normalized.traits) {
    normalized.traits = assertTraits(normalized.traits);
  }

  if (normalized.constraints) {
    if (normalized.constraints.length > MAX_CONSTRAINTS) {
      throw new StorageValidationError(
        `constraints must have <= ${MAX_CONSTRAINTS} entries`,
      );
    }
    normalized.constraints = normalized.constraints
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  return normalized;
};
