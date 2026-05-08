import { describe, expect, test } from "bun:test";
import { createInMemoryRepositories, createStorageServices } from "#/services";

describe("storage services", () => {
  test("creates and updates personality profile", async () => {
    const dependencies = createInMemoryRepositories();
    const services = createStorageServices(dependencies);

    const initial = await services.getPersonality();
    expect(initial.basePersonaText.length).toBeGreaterThan(0);
    expect(initial.version).toBe(1);

    const updated = await services.updatePersonality({
      basePersonaText: "Pragmatic and concise helper",
      traits: { directness: 0.9 },
    });

    expect(updated.basePersonaText).toBe("Pragmatic and concise helper");
    expect(updated.traits.directness).toBe(0.9);
    expect(updated.version).toBe(2);
  });

  test("creates and lists memory highlights", async () => {
    const dependencies = createInMemoryRepositories();
    const services = createStorageServices(dependencies);

    await services.createMemoryHighlight({
      whatHappened: "User shipped the first storage module",
      brightness: 0.9,
      happenedAt: "2026-05-08T10:00:00.000Z",
      tags: ["release", "milestone"],
    });

    await services.createMemoryHighlight({
      whatHappened: "Minor typo fix in docs",
      brightness: 0.2,
      happenedAt: "2026-05-07T10:00:00.000Z",
      tags: ["docs"],
    });

    const recent = await services.listMemoryHighlights({
      minBrightness: 0.5,
      limit: 10,
    });
    expect(recent).toHaveLength(1);
    expect(recent[0]?.whatHappened).toContain("first storage module");
  });

  test("normalizes memory highlight values", async () => {
    const dependencies = createInMemoryRepositories();
    const services = createStorageServices(dependencies);

    const memory = await services.createMemoryHighlight({
      whatHappened: "  User resolved a critical production issue  ",
      brightness: 1,
      happenedAt: new Date("2026-05-08T12:00:00.000Z"),
      source: "  incident-review  ",
    });

    expect(memory.whatHappened).toBe("User resolved a critical production issue");
    expect(memory.source).toBe("incident-review");
    expect(memory.happenedAt).toBe("2026-05-08T12:00:00.000Z");
    expect(memory.recordedAt.length).toBeGreaterThan(0);
  });
});
