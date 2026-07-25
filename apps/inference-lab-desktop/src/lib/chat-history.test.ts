import { describe, expect, it } from 'vitest';

import { createChatTitle } from '#/lib/chat-history';

describe('chat history', () => {
  it('keeps the fallback title free of ellipses for visual overflow treatment', () => {
    const prompt = 'Design a long intake workflow for international vendor onboarding';

    expect(createChatTitle(prompt, [])).toBe(prompt);
    expect(createChatTitle(prompt, [])).not.toContain('…');
  });
});
