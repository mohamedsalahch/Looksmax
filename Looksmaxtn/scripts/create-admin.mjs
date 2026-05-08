import path from "path";
import { existsSync } from "fs";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

try {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const backDir = path.resolve(scriptDir, "..", "back");
  const requireFromBack = createRequire(path.join(backDir, "package.json"));
  const dotenv = requireFromBack("dotenv");
  const envNames =
    process.env.NODE_ENV === "development"
      ? [".env", ".env.production"]
      : [".env.production", ".env"];

  for (const envName of envNames) {
    const envPath = path.join(backDir, envName);
    if (!existsSync(envPath)) continue;
    dotenv.config({ path: envPath });
    break;
  }
} catch {
  // Production can provide env vars directly.
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) continue;

    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }
  return args;
}

function cleanValue(value) {
  return String(value || "").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const email = cleanValue(args.email || process.env.ADMIN_EMAIL).toLowerCase();
const password = cleanValue(args.password || process.env.ADMIN_PASSWORD);
const name = cleanValue(args.name || process.env.ADMIN_NAME || email.split("@")[0] || "Admin");
const mongoUri = cleanValue(
  args["mongo-uri"] || process.env.MONGODB_URI || "mongodb://localhost:27017/looksmax"
);

if (!email || !password) {
  fail(
    "Usage: npm run seed:admin -- --email admin@example.com --password 'secret' [--name 'Admin Name'] [--mongo-uri mongodb://localhost:27017/looksmax]"
  );
}

if (password.length < 6) {
  fail("Password must be at least 6 characters.");
}

async function main() {
  await mongoose.connect(mongoUri);

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);
  const users = mongoose.connection.collection("users");

  const existing = await users.findOne({ email });
  const createdAt = existing?.createdAt instanceof Date ? existing.createdAt : now;
  const sessionVersion = Number(existing?.sessionVersion ?? 0) + 1;

  const nextUser = {
    name: existing?.name || name,
    email,
    password: passwordHash,
    role: "admin",
    isBlocked: false,
    emailVerified: true,
    emailVerificationTokenHash: null,
    emailVerificationExpiresAt: null,
    emailVerificationSentAt: null,
    passwordResetTokenHash: null,
    passwordResetExpiresAt: null,
    passwordResetSentAt: null,
    sessionVersion,
    address: existing?.address || { street: "", city: "", state: "", zip: "", phone: "" },
    bodyProfile:
      existing?.bodyProfile || {
        heightCm: "",
        weightKg: "",
        usualSize: "",
        profileImage: "",
        gender: "",
      },
    updatedAt: now,
  };

  const result = await users.updateOne(
    { email },
    {
      $set: nextUser,
      $setOnInsert: {
        createdAt,
      },
    },
    { upsert: true }
  );

  console.log(
    JSON.stringify(
      {
        email,
        name: nextUser.name,
        role: nextUser.role,
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
        upsertedId: result.upsertedId || null,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Failed to seed admin user:", error);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exit(1);
});
