const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { buildCartItemId, getCartItemProductId, getCartItemVariantId } = jiti("../../src/lib/cartItem.ts");

test("buildCartItemId keeps bare product ids intact", () => {
  assert.equal(buildCartItemId("prod-1"), "prod-1");
});

test("buildCartItemId composes productId and variantId", () => {
  assert.equal(buildCartItemId("prod-1", "var-xyz"), "prod-1__var-xyz");
});

test("buildCartItemId ignores empty variantId", () => {
  assert.equal(buildCartItemId("prod-1", ""), "prod-1");
});

test("getCartItemProductId strips variant suffixes", () => {
  assert.equal(getCartItemProductId("prod-1__var-xyz"), "prod-1");
});

test("getCartItemVariantId returns the variant suffix", () => {
  assert.equal(getCartItemVariantId("prod-1__var-xyz"), "var-xyz");
});

test("getCartItemVariantId is empty for bare ids", () => {
  assert.equal(getCartItemVariantId("prod-1"), "");
});
