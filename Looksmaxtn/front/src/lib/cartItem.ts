const CART_ITEM_SEPARATOR = "__";

function normalizePart(value?: string | null) {
  return (value || "").trim().toLowerCase();
}

export function buildCartItemId(productId: string, size?: string | null, color?: string | null) {
  const normalizedProductId = productId.trim();
  const normalizedSize = normalizePart(size);
  const normalizedColor = normalizePart(color);

  if (!normalizedSize && !normalizedColor) {
    return normalizedProductId;
  }

  return [
    normalizedProductId,
    normalizedSize || "_",
    normalizedColor || "_",
  ].join(CART_ITEM_SEPARATOR);
}

export function getCartItemProductId(cartItemId: string) {
  return cartItemId.split(CART_ITEM_SEPARATOR)[0] || cartItemId.split("-")[0] || cartItemId;
}

export function getCartItemVariantKey(cartItemId: string) {
  const parts = cartItemId.split(CART_ITEM_SEPARATOR);
  if (parts.length < 2) return "";
  return parts.slice(1).join(CART_ITEM_SEPARATOR);
}
