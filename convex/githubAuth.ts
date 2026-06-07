"use node";

import { createSign } from 'node:crypto';

import {
  getGitHubAppConfig,
  githubAppHeaders,
  githubInstallationHeaders,
  isGitHubAppConfigured,
} from '#convex/githubAppConfig';

const GITHUB_API = 'https://api.github.com';

export { getGitHubAppConfig, githubAppHeaders, githubInstallationHeaders, isGitHubAppConfigured };

export function createAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: appId,
    }),
  ).toString('base64url');

  const sign = createSign('RSA-SHA256');
  sign.update(`${header}.${payload}`);
  const signature = sign.sign(privateKey, 'base64url');
  return `${header}.${payload}.${signature}`;
}

const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();

export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const { appId, privateKey } = getGitHubAppConfig();
  const jwt = createAppJwt(appId, privateKey);

  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: githubAppHeaders(jwt),
  });

  if (!response.ok) {
    throw new Error(`Failed to get installation token (${response.status})`);
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  const expiresAt = new Date(data.expires_at).getTime() - 60_000;
  installationTokenCache.set(installationId, { token: data.token, expiresAt });

  return data.token;
}

export async function fetchInstallation(installationId: number) {
  const { appId, privateKey } = getGitHubAppConfig();
  const jwt = createAppJwt(appId, privateKey);

  const response = await fetch(`${GITHUB_API}/app/installations/${installationId}`, {
    headers: githubAppHeaders(jwt),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch installation (${response.status})`);
  }

  return (await response.json()) as {
    id: number;
    account: { login: string; type: 'User' | 'Organization' };
  };
}
