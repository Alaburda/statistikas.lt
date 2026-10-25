// Quarto pre-render step: builds the free planning app (_planavimas-src/, React +
// Vite) into planavimas/, which _quarto.yml lists under project.resources so it is
// copied to docs/planavimas/. Runs on full renders; partial renders and previews
// reuse an existing build.
const appDir = "_planavimas-src";
const npm = Deno.build.os === "windows" ? "npm.cmd" : "npm";

function exists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

async function run(...args: string[]) {
  const { code } = await new Deno.Command(npm, {
    args,
    cwd: appDir,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (code !== 0) {
    console.error(`planavimas: \`npm ${args.join(" ")}\` failed (exit ${code})`);
    Deno.exit(code);
  }
}

const renderAll = Deno.env.get("QUARTO_PROJECT_RENDER_ALL") === "1";
if (!renderAll && exists("planavimas/index.html")) {
  console.log("planavimas: partial render, keeping existing build");
  Deno.exit(0);
}

if (!exists(`${appDir}/node_modules`)) await run("ci");
await run("run", "build");
