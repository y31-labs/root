import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GeneratedInterface } from '#/lib/interface-contract';

const mocks = vi.hoisted(() => ({
  generateGatewayInterface: vi.fn(),
}));

vi.mock('#/server/gateway-interface', () => ({
  generateGatewayInterface: mocks.generateGatewayInterface,
}));

import { generateInterface } from '#/server/interface-generator';

const generatedInterface: GeneratedInterface = {
  title: 'Vendor comparison',
  domain: 'planning',
  intent: 'Choose a vendor with the right tradeoffs.',
  summary: 'A focused comparison of the options that matter most.',
  backend: {
    kind: 'gateway',
    detail: 'Generated through Vercel AI Gateway.',
  },
  controls: [
    {
      id: 'priority',
      label: 'Priority',
      type: 'select',
      value: 'Long-term flexibility',
      options: ['Long-term flexibility', 'Cost'],
    },
  ],
  sections: [
    {
      id: 'options',
      title: 'Options',
      kind: 'options',
      items: [
        {
          primary: 'Flexible option',
          secondary: 'Balances cost with future adaptability.',
          meta: ['Best fit'],
          tone: 'success',
        },
      ],
    },
  ],
  actions: [
    {
      label: 'Compare total cost',
      intent: 'Compare the options by total cost of ownership.',
      tone: 'neutral',
    },
  ],
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
});
