import { interfaceRequestSchema, type GeneratedInterface } from '#/lib/interface-contract';
import { generateGatewayInterface } from '#/server/gateway-interface';

export const generateInterface = async (input: unknown): Promise<GeneratedInterface> => {
  const request = interfaceRequestSchema.parse(input);
  return generateGatewayInterface(request);
};
