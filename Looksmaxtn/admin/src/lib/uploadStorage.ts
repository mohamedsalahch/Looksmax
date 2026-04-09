import { existsSync } from "fs";
import path from "path";

function getProjectRoot() {
  const cwd = process.cwd();

  if (path.basename(cwd) === "standalone" && path.basename(path.dirname(cwd)) === ".next") {
    return path.dirname(path.dirname(cwd));
  }

  return cwd;
}

export function getUploadsBaseDir() {
  const configuredDir = process.env.LOOKSMAX_UPLOADS_DIR?.trim();

  if (configuredDir && configuredDir !== "/shared-uploads") {
    return configuredDir;
  }

  if (configuredDir === "/shared-uploads" && existsSync(configuredDir)) {
    return configuredDir;
  }

  return path.join(getProjectRoot(), "public", "uploads");
}

export function getUploadCategoryDir(category: string) {
  return path.join(getUploadsBaseDir(), category);
}
