import { httpRouter } from "convex/server";

import { internal } from "#convex/_generated/api";
import { httpAction } from "#convex/_generated/server";
import { getGitHubAppConfig } from "#convex/githubAppConfig";
import { verifyGitHubWebhookSignature } from "#convex/githubWebhookVerify";

type InstallationEvent = {
  action: string;
  installation: { id: number };
};

type InstallationRepositoriesEvent = {
  action: string;
  installation: { id: number };
  repositories_removed?: Array<{
    id: number;
    full_name: string;
    name: string;
    owner: { login: string };
  }>;
};

export const githubWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let webhookSecret: string;
  try {
    webhookSecret = getGitHubAppConfig().webhookSecret ?? "";
  } catch {
    return new Response("GitHub App is not configured", { status: 500 });
  }

  if (!webhookSecret) {
    return new Response("GitHub webhook secret is not configured", {
      status: 500,
    });
  }

  const payload = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const event = request.headers.get("x-github-event");

  if (!(await verifyGitHubWebhookSignature(payload, signature, webhookSecret))) {
    return new Response("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(payload) as InstallationEvent | InstallationRepositoriesEvent;

  switch (event) {
    case "installation": {
      const installationEvent = body as InstallationEvent;
      if (installationEvent.action === "deleted") {
        await ctx.runMutation(internal.githubInstallations.removeByInstallationIdInternal, {
          installationId: installationEvent.installation.id,
        });
      }
      break;
    }
    case "installation_repositories": {
      const repoEvent = body as InstallationRepositoriesEvent;
      if (repoEvent.action === "removed" && repoEvent.repositories_removed) {
        await Promise.all(
          repoEvent.repositories_removed.map((repo) =>
            ctx.runMutation(internal.githubInstallations.removeRepoByPublicIdInternal, {
              publicId: repo.id.toString(),
              owner: repo.owner.login,
              name: repo.name,
            }),
          ),
        );
      }
      break;
    }
    default:
      break;
  }

  return new Response("OK", { status: 200 });
});

const http = httpRouter();

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: githubWebhook,
});

export default http;
