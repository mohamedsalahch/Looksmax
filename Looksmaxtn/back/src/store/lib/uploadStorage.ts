import { existsSync } from "fs";
import path from "path";

function getProjectRoot() {
  const cwd = process.cwd();

  if (path.basename(cwd) === "standalone" && path.basename(path.dirname(cwd)) === ".next") {
    return path.dirname(path.dirname(cwd));
  }

  if (
    path.basename(path.dirname(cwd)) === "standalone" &&
    path.basename(path.dirname(path.dirname(cwd))) === ".next"
  ) {
    return path.dirname(path.dirname(path.dirname(cwd)));
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

  return path.join(getProjectRoot(), "..", "front", "public", "uploads");
}

export function getUploadCategoryDir(category: string) {
  const baseDir = getUploadsBaseDir();

  if (baseDir !== path.join(getProjectRoot(), "..", "front", "public", "uploads")) {
    return path.join(baseDir, category);
  }

  if (category === "body-profiles") {
    return path.join(getProjectRoot(), "..", "front", "public", "uploads", category);
  }

  return path.join(getProjectRoot(), "..", "admin", "public", "uploads", category);
}
