const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const jiti = require("jiti")(__filename, {
  alias: {
    "@": path.join(__dirname, "../../src"),
  },
});

const { getGeneratorAuthHeaders } = jiti("../../src/lib/generatorAuth.ts");
const OutfitGenerationJob = jiti("../../src/store/models/OutfitGenerationJob.ts").default;

test("getGeneratorAuthHeaders sends the shared generator bearer token", () => {
  const previous = process.env.GENERATOR_API_KEY;
  process.env.GENERATOR_API_KEY = "test-generator-key";
  try {
    assert.deepEqual(getGeneratorAuthHeaders(), {
      "Content-Type": "application/json",
      Authorization: "Bearer test-generator-key",
    });
  } finally {
    if (previous === undefined) delete process.env.GENERATOR_API_KEY;
    else process.env.GENERATOR_API_KEY = previous;
  }
});

test("OutfitGenerationJob tracks charged and refunded tries", () => {
  const paths = OutfitGenerationJob.schema.paths;

  assert.ok(paths.tryCharged, "missing tryCharged field");
  assert.ok(paths.tryRefundedAt, "missing tryRefundedAt field");
});
