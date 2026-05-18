import { defineConfig } from "oxlint";

export default defineConfig({
  categories: {
    correctness: "warn",
  },
  options: {
    typeAware: true,
  },
  ignorePatterns: [
    "**/.astro/**",
    "**/convex/_generated/**",
    "**/*.gen.ts",
    "**/routeTree.gen.ts",
    "**/posthog.astro",
  ],
});