import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const sdPlugin = "com.agentglass.controller.sdPlugin";

/**
 * Bundle the plugin into a single Node ESM file that OpenDeck launches.
 * The @elgato/streamdeck runtime and everything else is bundled in, so the
 * shipped .sdPlugin needs no node_modules beside it.
 */
export default {
  input: "src/plugin.ts",
  output: {
    file: `${sdPlugin}/bin/plugin.js`,
    format: "es",
    sourcemap: false,
    // So OpenDeck can launch the bundle directly via its CodePath on Linux.
    banner: "#!/usr/bin/env node",
  },
  plugins: [
    typescript({ tsconfig: "./tsconfig.json" }),
    nodeResolve({ exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
  ],
  // TS5096 is emitted only because `.ts` import specifiers need
  // `allowImportingTsExtensions`, which the plugin can't pair with emit — the
  // bundle is produced correctly regardless, so silence just that one.
  onwarn(warning, warn) {
    if (typeof warning.message === "string" && warning.message.includes("TS5096")) return;
    warn(warning);
  },
};
