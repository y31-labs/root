import { v } from "convex/values";

import { mutation, query } from "#convex/_generated/server";
import { verifyIdentity } from "#convex/utils";

export const list = query({
  args: {},
  handler: (ctx) =>
    verifyIdentity(ctx).then((identity) =>
      ctx.db
        .query("repos")
        .withIndex("by_user_owner_name", (q) => q.eq("userId", identity.subject))
        .collect(),
    ),
});

export const create = mutation({
  args: {
    owner: v.string(),
    name: v.string(),
    defaultBranch: v.string(),
    selected: v.boolean(),
  },
  handler: async (ctx, { owner, name, defaultBranch, selected }) => {
    const identity = await verifyIdentity(ctx);

    const repos = await ctx.db
      .query("repos")
      .withIndex("by_user_owner_name", (q) => q.eq("userId", identity.subject))
      .collect();
    const existing = repos.find((r) => r.owner === owner && r.name === name);

    if (existing) return existing._id;

    const id = await ctx.db.insert("repos", {
      owner,
      name,
      defaultBranch,
      selected,
      userId: identity.subject,
    });

    if (selected)
      await Promise.all(
        repos
          .filter((r) => r._id !== id && r.selected)
          .map((r) => ctx.db.patch("repos", r._id, { selected: false })),
      );

    return id;
  },
});

export const remove = mutation({
  args: { id: v.id("repos") },
  handler: async (ctx, { id }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(id);
    if (repo?.userId !== identity.subject) {
      return { removed: false };
    }
    await ctx.db.delete(id);
    return { removed: true };
  },
});

export const select = mutation({
  args: { id: v.id("repos"), selected: v.boolean() },
  handler: async (ctx, { id, selected }) => {
    const identity = await verifyIdentity(ctx);
    const repo = await ctx.db.get(id);
    if (repo?.userId !== identity.subject) {
      return { updated: false };
    }
    await ctx.db.patch(id, { selected });
    return { updated: true };
  },
});
