import { type Infer, v } from 'convex/values';

import { GENERATION_POLICY } from '#convex/chat/policy';
import { ConfigError, PayloadError, VerificationError } from '#convex/integrations/common/errors';

export const demoRequest = v.object({
  token: v.string(),
  verificationToken: v.string(),
  history: v.array(
    v.object({
      role: v.union(v.literal('user'), v.literal('assistant')),
      content: v.string(),
    }),
  ),
});

type DemoRequest = Infer<typeof demoRequest>;
export type History = DemoRequest['history'];

type TurnstileResponse =
  | {
      success: true;
      hostname: string;
      cdata: string;
    }
  | { success: false };

export const validateTokens = async ({
  token,
  verificationToken,
}: Pick<DemoRequest, 'token' | 'verificationToken'>) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) throw new ConfigError('TURNSTILE_SECRET_KEY');

  const allowedHostnames = process.env.TURNSTILE_ALLOWED_HOSTNAMES?.split(',');
  if (!allowedHostnames) throw new ConfigError('TURNSTILE_ALLOWED_HOSTNAMES');

  if (!verificationToken) throw new VerificationError();

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret, response: verificationToken }),
  });
  if (!response.ok) throw new VerificationError();
  const result: TurnstileResponse = await response.json();
  if (!result.success || !allowedHostnames.includes(result.hostname) || result.cdata !== token)
    throw new VerificationError();
};

interface ValidatePayloadProps {
  history: DemoRequest['history'];
  policy: GENERATION_POLICY;
}

export const validatePayload = async ({
  history,
  policy: { maxMessage },
}: ValidatePayloadProps) => {
  if (history.at(-1)?.role !== 'user') throw new PayloadError('Last message must be from the user');
  if (maxMessage !== undefined && history.some((m) => m.content.length > maxMessage))
    throw new PayloadError('Message too long');
};
