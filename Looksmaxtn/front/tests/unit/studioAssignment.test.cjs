const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { inferStudioAssignmentZone } = jiti("../../src/lib/studioAssignment.ts");

test("inferStudioAssignmentZone maps headwear terms", () => {
  assert.equal(
    inferStudioAssignmentZone({ name: "Warm Beanie", categories: ["Accessories"] }),
    "headwear"
  );
});

test("inferStudioAssignmentZone maps tops", () => {
  assert.equal(
    inferStudioAssignmentZone({ name: "Heavy Cotton Tee", categories: ["Streetwear"] }),
    "top"
  );
});

test("inferStudioAssignmentZone maps bottoms", () => {
  assert.equal(
    inferStudioAssignmentZone({ name: "Tailored Pants", categories: ["Formal Wear"] }),
    "bottom"
  );
});

test("inferStudioAssignmentZone maps shoes by subtype", () => {
  assert.equal(
    inferStudioAssignmentZone({ name: "Runner", categories: ["Sneakers"], fashionSubtype: "shoes" }),
    "footwear"
  );
});

test("inferStudioAssignmentZone defaults to outerwear", () => {
  assert.equal(
    inferStudioAssignmentZone({ name: "Minimal Vest", categories: ["Layering"] }),
    "outerwear"
  );
});

