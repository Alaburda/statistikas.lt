// Quarto pre-render step: builds the free analysis app (_analize-src/, React +
// Vite) into analize/, which _quarto.yml lists under project.resources so it is
// copied to docs/analize/. Runs on full renders; partial renders and previews
// reuse an existing build.
const appDir = "_analize-src";
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
    console.error(`analize: \`npm ${args.join(" ")}\` failed (exit ${code})`);
    Deno.exit(code);
  }
}

const renderAll = Deno.env.get("QUARTO_PROJECT_RENDER_ALL") === "1";
if (!renderAll && exists("analize/index.html")) {
  console.log("analize: partial render, keeping existing build");
  Deno.exit(0);
}

if (!exists(`${appDir}/node_modules`)) await run("ci");
await run("run", "build");
