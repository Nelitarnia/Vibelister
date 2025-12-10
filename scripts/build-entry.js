import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entryPoint = path.join(projectRoot, "scripts/app/main.js");
const outFile = path.join(projectRoot, "public/dist/app.js");

esbuild
  .build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    sourcemap: true,
    format: "esm",
    target: "es2019",
    outfile: outFile,
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
