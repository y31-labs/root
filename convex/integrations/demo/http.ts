import { toServerSentEventsResponse } from '@tanstack/ai';
import { validate } from 'convex-helpers/validators';

import { httpAction } from '#convex/_generated/server';
import { GENERATION_POLICY } from '#convex/chat/policy';
import { streamReply } from '#convex/chat/textGeneration';
import { KnownError } from '#convex/integrations/common/errors';
import { demoRequest, validatePayload, validateTokens } from '#convex/integrations/demo/validators';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

export const preflight = httpAction(async () => new Response(null, { status: 204, headers }));

const makeErrorResponse = (error: string) => Response.json({ error }, { status: 400, headers });
const invalidResponse = makeErrorResponse('Invalid request');

const policy = GENERATION_POLICY.demo;

export const stream = httpAction(async (_, request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidResponse;
  }
  if (!validate(demoRequest, body)) return invalidResponse;

  const { token, verificationToken, history } = body;

  try {
    await validateTokens({ token, verificationToken });
    await validatePayload({ history, policy });

    const abortController = new AbortController();
    const signal = AbortSignal.any([request.signal, abortController.signal]);
    return toServerSentEventsResponse(streamReply({ messages: history, signal, policy }), {
      headers,
      abortController,
    });
  } catch (e) {
    if (e instanceof KnownError) return makeErrorResponse(e.message);
    return makeErrorResponse('Unexpected error');
  }
});
