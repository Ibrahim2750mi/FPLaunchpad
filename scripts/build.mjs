import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || resolve(".cache"),
};

const result = spawnSync(
  "spago",
  ["bundle", "--bundle-type", "module", "--platform", "browser", "--module", "LeanSubset.Runner", "--outfile", "dist/lean-stepper.js"],
  { env, stdio: "inherit", shell: process.platform === "win32" },
);

if (result.status !== 0) process.exit(result.status ?? 1);

const leanRuntime = spawnSync(
  resolve("node_modules/esbuild/bin/esbuild"),
  ["node_modules/lean4.js/src/lean4.js", "--bundle", "--format=esm", "--platform=browser", "--outfile=dist/lean-runtime.js"],
  { env, stdio: "inherit" },
);

process.exitCode = leanRuntime.status ?? 1;
