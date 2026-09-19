// Generate src/api/schema.d.ts from the backend's OpenAPI document with openapi-typescript
// (SPEC §3.5: API types are generated, never written by hand).
//
//   npm run gen:types                # uses `python` from PATH
//   PYTHON=/path/to/python3.12 npm run gen:types
//
// The Python used must have the backend's dependencies installed (backend/pyproject.toml).
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..");
const openapiJson = path.join(tmpdir(), "six-degrees-openapi.json");
const python = process.env.PYTHON ?? "python";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", cwd: frontend, ...options });
  if (result.error || result.status !== 0) {
    console.error(`gen:types: failed: ${command} ${args.join(" ")}`);
    process.exit(result.status ?? 1);
  }
}

run(python, [path.join(here, "export_openapi.py"), openapiJson]);
run(process.execPath, [
  path.join(frontend, "node_modules", "openapi-typescript", "bin", "cli.js"),
  openapiJson,
  "-o",
  path.join("src", "api", "schema.d.ts"),
]);
