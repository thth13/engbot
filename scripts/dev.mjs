import { spawn } from "node:child_process";

const app = process.argv[2];
if (!["web", "bot"].includes(app)) throw new Error("Choose web or bot");
const child = spawn(
  "npm",
  [
    "run",
    "dev",
    "--workspace",
    `@engbot/${app}`,
    "--",
    ...process.argv.slice(3),
  ],
  { stdio: "inherit", env: process.env },
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal === "SIGINT" ? 130 : 1);
});
