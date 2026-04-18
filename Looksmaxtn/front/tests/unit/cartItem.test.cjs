const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { buildCartItemId, getCartItemProductId, getCartItemVariantKey } = jiti("../../src/lib/cartItem.ts");

test("buildCartItemId keeps bare product ids intact", () => {
  assert.equal(buildCartItemId("prod-1"), "prod-1");
});

test("buildCartItemId normalizes size and color into a stable variant id", () => {
  assert.equal(buildCartItemId("prod-1", "M", "Blue"), "prod-1__m__blue");
});

test("getCartItemProductId strips variant suffixes", () => {
  assert.equal(getCartItemProductId("prod-1__m__blue"), "prod-1");
});

test("getCartItemVariantKey returns the variant suffix", () => {
  assert.equal(getCartItemVariantKey("prod-1__m__blue"), "m__blue");
});

