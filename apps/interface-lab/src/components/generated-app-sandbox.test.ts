import { describe, expect, it } from 'vitest';

import { createSandboxDocument } from '#/components/generated-app-sandbox';

describe('generated app sandbox', () => {
  it('injects the plugin bridge before generated application code', () => {
    const document = createSandboxDocument(
      'Repository <explorer>',
      '<main id="app"></main><script>window.y31.invoke({});</script>',
    );

    expect(document).toContain('<title>Repository &lt;explorer&gt;</title>');
    expect(document).toContain("connect-src 'none'");
    expect(document.indexOf('window.y31 = Object.freeze')).toBeLessThan(
      document.indexOf('<main id="app">'),
    );
  });
});
