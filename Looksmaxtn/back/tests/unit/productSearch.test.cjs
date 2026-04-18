const test = require("node:test");
const assert = require("node:assert/strict");
const jiti = require("jiti")(__filename);

const { filterAndRankProducts, scoreProductSearch } = jiti("../../src/store/lib/productSearch.ts");

test("scoreProductSearch rewards direct name matches", () => {
  const score = scoreProductSearch(
    { _id: "1", name: "Air Max Sneaker", brand: "LOOKSMAX", categories: ["shoes"] },
    "sneaker"
  );

  assert.ok(score > 0);
});

test("scoreProductSearch handles synonyms", () => {
  const score = scoreProductSearch(
    { _id: "2", name: "Tailored Trousers", brand: "LOOKSMAX", categories: ["bottoms"] },
    "pants"
  );

  assert.ok(score > 0);
});

test("filterAndRankProducts returns the strongest matches first", () => {
  const products = [
    { _id: "1", name: "Basic Hat", brand: "LOOKSMAX", categories: ["accessories"], price: 30 },
    { _id: "2", name: "Winter Hat", brand: "LOOKSMAX", categories: ["headwear"], price: 50 },
    { _id: "3", name: "Running Shoe", brand: "LOOKSMAX", categories: ["shoes"], price: 80 },
  ];

  const ranked = filterAndRankProducts(products, "hat");
  assert.deepEqual(
    ranked.map((product) => product._id),
    ["2", "1"]
  );
});

