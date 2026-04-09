import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const [, , appName, portArg] = process.argv;

if (!appName || !portArg) {
  console.error("Usage: node ../scripts/start-standalone.mjs <app-name> <port>");
  process.exit(1);
}

const appRoot = process.cwd();
const standaloneRoot = path.join(appRoot, ".next", "standalone");
const nestedAppRoot = path.join(standaloneRoot, appName);
const nestedServer = path.join(nestedAppRoot, "server.js");
const rootServer = path.join(standaloneRoot, "server.js");

const runtimeRoot = fs.existsSync(nestedServer) ? nestedAppRoot : standaloneRoot;
const serverFile = fs.existsSync(nestedServer) ? nestedServer : rootServer;

if (!fs.existsSync(serverFile)) {
  console.error(`Standalone server not found for ${appName}. Expected ${nestedServer} or ${rootServer}.`);
  process.exit(1);
}

const sourceStaticDir = path.join(appRoot, ".next", "static");
const targetStaticDir = path.join(runtimeRoot, ".next", "static");
const targetNextDir = path.join(runtimeRoot, ".next");

fs.mkdirSync(targetNextDir, { recursive: true });
fs.rmSync(targetStaticDir, { recursive: true, force: true });
if (fs.existsSync(sourceStaticDir)) {
  fs.cpSync(sourceStaticDir, targetStaticDir, { recursive: true });
}

const child = spawn(process.execPath, [serverFile], {
  cwd: runtimeRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    PORT: portArg,
    HOSTNAME: "0.0.0.0",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
