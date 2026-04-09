type SearchableProduct = {
  _id: { toString(): string } | string;
  name?: string;
  brand?: string;
  categories?: string[];
  description?: string;
  tag?: string;
  sizes?: string[];
  colors?: string[];
  cloneSourceName?: string;
  price?: number;
  stock?: number;
};

const SYNONYM_GROUPS = [
  ["sneaker", "sneakers", "trainer", "trainers", "shoe", "shoes", "sniker", "snikers"],
  ["hoodie", "hoodies", "pull", "pullover", "sweatshirt", "sweater"],
  ["hat", "hats", "cap", "caps", "beanie", "beanies"],
  ["jacket", "jackets", "coat", "coats", "blazer", "blazers", "veste", "vestes"],
  ["pant", "pants", "trouser", "trousers", "jean", "jeans", "bottom", "bottoms"],
  ["shirt", "shirts", "tee", "tshirt", "t-shirt", "top", "tops"],
  ["fragrance", "fragrances", "perfume", "perfumes", "parfum", "parfums", "scent", "scents"],
];

const ALIAS_TO_CANONICAL = new Map<string, string>();

for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const term of group) {
    ALIAS_TO_CANONICAL.set(term, canonical);
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularize(token: string) {
  if (token.endsWith("ies") && token.length > 3) return `${token.slice(0, -3)}y`;
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && token.length > 3) return token.slice(0, -1);
  return token;
}

function normalizeToken(token: string) {
  const normalized = singularize(normalizeText(token));
  return ALIAS_TO_CANONICAL.get(normalized) || normalized;
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((token) => normalizeToken(token))
    .filter((token) => token.length > 1);
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function getMatchScore(queryToken: string, candidateTokens: string[]) {
  for (const candidate of candidateTokens) {
    if (candidate === queryToken) return 14;
    if (candidate.includes(queryToken) || queryToken.includes(candidate)) return 9;
    const distance = levenshtein(queryToken, candidate);
    const threshold = queryToken.length <= 4 ? 1 : 2;
    if (distance <= threshold) return 6;
  }
  return 0;
}

export function scoreProductSearch(product: SearchableProduct, search: string) {
  const query = normalizeText(search);
  const queryTokens = tokenize(search);
  if (!query || queryTokens.length === 0) return 0;

  const nameText = normalizeText(product.name || "");
  const brandText = normalizeText(product.brand || "");
  const categoryText = normalizeText((product.categories || []).join(" "));
  const descriptionText = normalizeText(product.description || "");
  const tagText = normalizeText(product.tag || "");
  const cloneText = normalizeText(product.cloneSourceName || "");
  const sizeText = normalizeText((product.sizes || []).join(" "));
  const colorText = normalizeText((product.colors || []).join(" "));
  const combinedText = [nameText, brandText, categoryText, descriptionText, tagText, cloneText, sizeText, colorText]
    .filter(Boolean)
    .join(" ");

  const nameTokens = tokenize(product.name || "");
  const brandTokens = tokenize(product.brand || "");
  const categoryTokens = tokenize((product.categories || []).join(" "));
  const descriptionTokens = tokenize(
    `${product.description || ""} ${product.tag || ""} ${product.cloneSourceName || ""} ${(product.sizes || []).join(" ")} ${(product.colors || []).join(" ")}`
  );

  let score = 0;

  if (nameText.includes(query)) score += 40;
  else if (combinedText.includes(query)) score += 24;

  for (const token of queryTokens) {
    const nameScore = getMatchScore(token, nameTokens);
    const brandScore = getMatchScore(token, brandTokens);
    const categoryScore = getMatchScore(token, categoryTokens);
    const descriptionScore = getMatchScore(token, descriptionTokens);
    const bestScore = Math.max(nameScore, brandScore, categoryScore, descriptionScore);
    score += bestScore;
  }

  if (queryTokens.every((token) => combinedText.includes(token))) {
    score += 12;
  }

  return score;
}

export function filterAndRankProducts<T extends SearchableProduct>(products: T[], search: string) {
  const ranked = products
    .map((product) => ({
      product,
      score: scoreProductSearch(product, search),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.product.price || 0) - (a.product.price || 0);
    });

  return ranked.map((entry) => entry.product);
}
