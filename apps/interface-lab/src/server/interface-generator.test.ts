import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generatedAppSchema, type GeneratedInterface } from '#/lib/interface-contract';

const mocks = vi.hoisted(() => ({
  generateGatewayInterface: vi.fn(),
}));

vi.mock('#/server/gateway-interface', () => ({
  generateGatewayInterface: mocks.generateGatewayInterface,
}));

import { generateInterface } from '#/server/interface-generator';

const generatedInterface: GeneratedInterface = {
  title: 'Vendor comparison',
  description: 'An interactive workspace for comparing vendor tradeoffs.',
  html: '<main><h1>Vendor comparison</h1><script>window.appReady = true;</script></main>',
  backend: {
    kind: 'gateway',
    detail: 'Application generated through Vercel AI Gateway.',
  },
};

describe('generateInterface', () => {
  beforeEach(() => {
    mocks.generateGatewayInterface.mockReset();
  });

  it('uses the Vercel AI Gateway generator for a valid brief', async () => {
    mocks.generateGatewayInterface.mockResolvedValue(generatedInterface);

    await expect(
      generateInterface({ brief: 'Compare two vendors for a small product team.' }),
    ).resolves.toEqual(generatedInterface);
  });

  it('propagates gateway generation failures', async () => {
    const error = new Error('Gateway unavailable');
    mocks.generateGatewayInterface.mockRejectedValue(error);

    await expect(
      generateInterface({ brief: 'Compare two vendors for a small product team.' }),
    ).rejects.toBe(error);
  });

  it('passes the current application through for an incremental adjustment', async () => {
    mocks.generateGatewayInterface.mockResolvedValue(generatedInterface);
    const currentApp = {
      title: generatedInterface.title,
      description: generatedInterface.description,
      html: generatedInterface.html,
    };

    await generateInterface({
      brief: 'Add a compact cost filter above the comparison.',
      currentApp,
    });

    expect(mocks.generateGatewayInterface).toHaveBeenCalledWith({
      brief: 'Add a compact cost filter above the comparison.',
      currentApp,
    });
  });

  it('limits model output to a generated application document', () => {
    expect(
      generatedAppSchema.parse({
        title: 'Repository explorer',
        description: 'Explore live repositories.',
        html: '<main>App</main>',
      }),
    ).toEqual({
      title: 'Repository explorer',
      description: 'Explore live repositories.',
      html: '<main>App</main>',
    });
  });
});
