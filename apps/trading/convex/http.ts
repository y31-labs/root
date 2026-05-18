import { httpAction } from '#convex/_generated/server';
import { httpRouter } from 'convex/server';

const MASSIVE_BRANDING_HOST = 'https://api.massive.com/';

const TRANSPARENT_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

function transparentPngResponse(status = 502) {
  return new Response(TRANSPARENT_PNG, {
    status,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store',
    },
  });
}

export const brandingIcon = httpAction(async (_ctx, request) => {
  const url = new URL(request.url);
  const src = url.searchParams.get('src');
  if (!src) {
    return new Response('Missing src', { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(src);
  } catch {
    return new Response('Invalid src', { status: 400 });
  }

  if (!target.toString().startsWith(MASSIVE_BRANDING_HOST)) {
    return new Response('Upstream not allowed', { status: 400 });
  }

  const apiKey = process.env.MASSIVE_API_KEY;
  if (!apiKey) {
    return transparentPngResponse(500);
  }

  target.searchParams.set('apiKey', apiKey);

  let upstream: Response;
  try {
    upstream = await fetch(target.toString());
  } catch {
    return transparentPngResponse();
  }

  if (!upstream.ok) {
    return transparentPngResponse(upstream.status);
  }

  const contentType = upstream.headers.get('Content-Type') ?? 'image/png';
  const body = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
});

const http = httpRouter();

http.route({
  path: '/branding/icon',
  method: 'GET',
  handler: brandingIcon,
});

export default http;
