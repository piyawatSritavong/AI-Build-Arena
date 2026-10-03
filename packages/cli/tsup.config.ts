import { defineConfig } from "tsup";

// One self-contained file: workspace packages (@arena/*) are bundled in, so the npm package has no private deps.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  noExternal: [/^@arena\//],
  banner: { js: "#!/usr/bin/env node" },
});
