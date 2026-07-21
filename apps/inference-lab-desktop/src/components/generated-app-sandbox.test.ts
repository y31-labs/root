import { describe, expect, it } from 'vitest';

import { createSandboxDocument } from '#/components/generated-app-sandbox';

describe('generated app sandbox', () => {
  it('escapes the document title and installs a constrained plugin bridge', () => {
    const document = createSandboxDocument('<Unsafe>', '<main>Working app</main>');

    expect(document).toContain('<title>&lt;Unsafe&gt;</title>');
    expect(document).toContain("default-src 'none'");
    expect(document).toContain('window.y31 = Object.freeze');
    expect(document).toContain('<main>Working app</main>');
  });
});
