import { describe, expect, it } from 'vitest';

import { rewriteGeneratedAppBundle } from '#/features/apps/runtime/rewrite-bundle';

describe('generated app bundle rewriting', () => {
  const urls = {
    icons: 'blob:icons',
    react: 'blob:react',
    sdk: 'blob:sdk',
    ui: 'blob:ui',
  };

  it('maps every allowed generated-app import to a host module', () => {
    const bundle = `
      import React, { useMemo } from "react";
      import { usePersistentState } from '@y31/local-app';
      import {
        Page,
        Surface,
      } from "@y31/local-app/ui";
      import { Activity } from '@y31/local-app/icons';
    `;

    const rewritten = rewriteGeneratedAppBundle(bundle, urls);

    expect(rewritten).toContain('from "blob:react"');
    expect(rewritten).toContain('from "blob:sdk"');
    expect(rewritten).toContain('from "blob:ui"');
    expect(rewritten).toContain('from "blob:icons"');
  });

  it('does not rewrite ordinary app strings', () => {
    const rewritten = rewriteGeneratedAppBundle(
      `import React from "react";
const label = "react";
const example = 'import React from "react"';
export default label;`,
      urls,
    );

    expect(rewritten).toContain('from "blob:react"');
    expect(rewritten).toContain('const label = "react"');
    expect(rewritten).toContain('import React from "react"\'');
  });
});
