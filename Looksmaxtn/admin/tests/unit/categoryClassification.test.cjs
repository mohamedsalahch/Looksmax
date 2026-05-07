/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const {
  getCategoryGender,
  getCategoryZone,
  getLeavesForZone,
  getZoneRequirements,
} = jiti("../../src/lib/categoryClassification.ts");

const categories = [
  { name: "Men", slug: "men", parentSlug: null },
  { name: "Garments", slug: "garments-men", parentSlug: "men" },
  { name: "Set", slug: "set-men", parentSlug: "garments-men" },
  { name: "Footwear", slug: "footwear-men", parentSlug: "garments-men" },
  { name: "Sneakers", slug: "sneakers-men", parentSlug: "footwear-men" },
  { name: "Women", slug: "women", parentSlug: null },
  { name: "Garments", slug: "garments-women", parentSlug: "women" },
  { name: "Set", slug: "set-women", parentSlug: "garments-women" },
  { name: "Footwear", slug: "footwear-women", parentSlug: "garments-women" },
  { name: "Heels", slug: "heels-women", parentSlug: "footwear-women" },
  { name: "Children", slug: "children", parentSlug: null },
  { name: "Garments", slug: "garments-children", parentSlug: "children" },
  { name: "Set", slug: "set-children", parentSlug: "garments-children" },
  { name: "Footwear", slug: "footwear-children", parentSlug: "garments-children" },
  { name: "Kids Sneakers", slug: "sneakers-children", parentSlug: "footwear-children" },
];

test("set categories classify as full-body dress zone", () => {
  assert.equal(getCategoryZone(categories, "set-men"), "dress");
  assert.equal(getCategoryZone(categories, "set-women"), "dress");
  assert.equal(getCategoryZone(categories, "set-children"), "dress");
  assert.equal(getCategoryGender(categories, "set-men"), "men");
  assert.equal(getCategoryGender(categories, "set-children"), "children");
});

test("dress zone requires only footwear companion generation", () => {
  const requirements = getZoneRequirements("dress");
  assert.deepEqual(requirements.companionZones, ["footwear"]);
  assert.equal(requirements.needsFootwearCompanion, true);
  assert.equal(requirements.needsTopCompanion, false);
  assert.equal(requirements.needsBottomCompanion, false);
});

test("footwear leaves remain gender-scoped for set companions", () => {
  assert.deepEqual(
    getLeavesForZone(categories, "footwear", "men").map((category) => category.slug),
    ["sneakers-men"]
  );
  assert.deepEqual(
    getLeavesForZone(categories, "footwear", "women").map((category) => category.slug),
    ["heels-women"]
  );
  assert.deepEqual(
    getLeavesForZone(categories, "footwear", "children").map((category) => category.slug),
    ["sneakers-children"]
  );
});
