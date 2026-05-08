import type {
  CreateMemoryHighlightInput,
  ListMemoryHighlightsInput,
  MemoryHighlight,
  MemoryHighlightRepository,
  PersonalityProfile,
  PersonalityRepository,
  UpdatePersonalityInput,
} from "#/types";
import {
  DEFAULT_PROFILE_ID,
  normalizeDate,
  validateMemoryInput,
  validatePersonalityInput,
} from "#/validation";

export interface StorageServices {
  getPersonality(): Promise<PersonalityProfile>;
  updatePersonality(input: UpdatePersonalityInput): Promise<PersonalityProfile>;
  createMemoryHighlight(
    input: CreateMemoryHighlightInput,
  ): Promise<MemoryHighlight>;
  listMemoryHighlights(
    input?: ListMemoryHighlightsInput,
  ): Promise<MemoryHighlight[]>;
}

export interface StorageDependencies {
  personalityRepository: PersonalityRepository;
  memoryHighlightRepository: MemoryHighlightRepository;
  defaults?: {
    basePersonaText?: string;
    traits?: Record<string, number>;
    constraints?: string[];
  };
}

const defaultTraits: Record<string, number> = {
  warmth: 0.5,
  assertiveness: 0.5,
  curiosity: 0.6,
  humor: 0.3,
  directness: 0.6,
};

export const createStorageServices = (
  dependencies: StorageDependencies,
): StorageServices => {
  const { personalityRepository, memoryHighlightRepository, defaults } =
    dependencies;

  const getPersonality = async (): Promise<PersonalityProfile> => {
    const existing = await personalityRepository.get();
    if (existing) return existing;

    const now = new Date().toISOString();
    const seeded: PersonalityProfile = {
      id: DEFAULT_PROFILE_ID,
      basePersonaText:
        defaults?.basePersonaText ??
        "Helpful assistant. Adaptive and clear communication style.",
      traits: defaults?.traits ?? defaultTraits,
      constraints: defaults?.constraints,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };
    return personalityRepository.upsert(seeded);
  };

  const updatePersonality = async (
    input: UpdatePersonalityInput,
  ): Promise<PersonalityProfile> => {
    const normalizedInput = validatePersonalityInput(input);
    const current = await getPersonality();
    const updatedAt = normalizeDate(
      normalizedInput.updatedAt ?? new Date().toISOString(),
    );

    const updated: PersonalityProfile = {
      ...current,
      basePersonaText: normalizedInput.basePersonaText ?? current.basePersonaText,
      traits: normalizedInput.traits
        ? { ...current.traits, ...normalizedInput.traits }
        : current.traits,
      constraints: normalizedInput.constraints ?? current.constraints,
      version: current.version + 1,
      updatedAt,
    };

    return personalityRepository.upsert(updated);
  };

  const createMemoryHighlight = async (
    input: CreateMemoryHighlightInput,
  ): Promise<MemoryHighlight> => {
    const normalized = validateMemoryInput(input);
    const memory: MemoryHighlight = {
      id: normalized.id ?? crypto.randomUUID(),
      whatHappened: normalized.whatHappened,
      brightness: normalized.brightness,
      happenedAt: normalizeDate(normalized.happenedAt),
      recordedAt: normalizeDate(normalized.recordedAt ?? new Date().toISOString()),
      tags: normalized.tags,
      source: normalized.source,
    };

    return memoryHighlightRepository.create(memory);
  };

  const listMemoryHighlights = async (
    input?: ListMemoryHighlightsInput,
  ): Promise<MemoryHighlight[]> => {
    return memoryHighlightRepository.listRecent(input);
  };

  return {
    getPersonality,
    updatePersonality,
    createMemoryHighlight,
    listMemoryHighlights,
  };
};

export const createInMemoryRepositories = (): StorageDependencies => {
  let personality: PersonalityProfile | null = null;
  const memories = new Map<string, MemoryHighlight>();

  const personalityRepository: PersonalityRepository = {
    get: async () => personality,
    upsert: async (profile) => {
      personality = profile;
      return profile;
    },
  };

  const memoryHighlightRepository: MemoryHighlightRepository = {
    create: async (memory) => {
      memories.set(memory.id, memory);
      return memory;
    },
    listRecent: async (input) => {
      const minBrightness = input?.minBrightness;
      const tag = input?.tag;
      const limit = input?.limit ?? 50;

      return Array.from(memories.values())
        .filter((memory) => {
          if (
            minBrightness !== undefined &&
            memory.brightness < minBrightness
          ) {
            return false;
          }
          if (tag && !memory.tags?.includes(tag)) {
            return false;
          }
          return true;
        })
        .sort((a, b) => {
          return (
            new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime()
          );
        })
        .slice(0, limit);
    },
    updateBrightness: async ({ id, brightness }) => {
      const existing = memories.get(id);
      if (!existing) {
        throw new Error(`Memory highlight not found for id ${id}`);
      }
      const updated: MemoryHighlight = { ...existing, brightness };
      memories.set(id, updated);
      return updated;
    },
  };

  return { personalityRepository, memoryHighlightRepository };
};
