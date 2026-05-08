export type ISODateString = string;

export type PersonalityTraits = Record<string, number>;

export interface PersonalityProfile {
  id: string;
  basePersonaText: string;
  traits: PersonalityTraits;
  constraints?: string[];
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface MemoryHighlight {
  id: string;
  whatHappened: string;
  brightness: number;
  happenedAt: ISODateString;
  recordedAt: ISODateString;
  tags?: string[];
  source?: string;
}

export interface UpdatePersonalityInput {
  basePersonaText?: string;
  traits?: PersonalityTraits;
  constraints?: string[];
  updatedAt?: Date | string;
}

export interface CreateMemoryHighlightInput {
  id?: string;
  whatHappened: string;
  brightness: number;
  happenedAt: Date | string;
  recordedAt?: Date | string;
  tags?: string[];
  source?: string;
}

export interface ListMemoryHighlightsInput {
  limit?: number;
  minBrightness?: number;
  tag?: string;
}

export interface UpdateMemoryBrightnessInput {
  id: string;
  brightness: number;
}

export interface PersonalityRepository {
  get(): Promise<PersonalityProfile | null>;
  upsert(profile: PersonalityProfile): Promise<PersonalityProfile>;
}

export interface MemoryHighlightRepository {
  create(memory: MemoryHighlight): Promise<MemoryHighlight>;
  listRecent(input?: ListMemoryHighlightsInput): Promise<MemoryHighlight[]>;
  updateBrightness(input: UpdateMemoryBrightnessInput): Promise<MemoryHighlight>;
}
