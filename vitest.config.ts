import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    // Subagents run in git worktrees under .claude/worktrees/, each a full
    // copy of the repo (tests included). Without this, vitest recurses into
    // them and runs every suite twice — and a work-in-progress worktree
    // could fail the main run. Keep the default excludes too.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.claude/**"],
  },
});
