import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const env = {
  ...process.env,
  XDG_CACHE_HOME: process.env.XDG_CACHE_HOME || resolve(".cache"),
};

const result = spawnSync(
  "spago",
  ["bundle", "--bundle-type", "module", "--platform", "browser", "--module", "ProofPlayer", "--outfile", "dist/proof-core.js"],
  { env, stdio: "inherit", shell: process.platform === "win32" },
);

process.exitCode = result.status ?? 1;
