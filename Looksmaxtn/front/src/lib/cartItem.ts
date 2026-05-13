const CART_ITEM_SEPARATOR = "__";

export function buildCartItemId(productId: string, variantId?: string | null) {
  const normalizedProductId = productId.trim();
  const normalizedVariantId = (variantId || "").trim();

  if (!normalizedVariantId) {
    return normalizedProductId;
  }

  return [normalizedProductId, normalizedVariantId].join(CART_ITEM_SEPARATOR);
}

export function getCartItemProductId(cartItemId: string) {
  return cartItemId.split(CART_ITEM_SEPARATOR)[0] || cartItemId;
}

export function getCartItemVariantId(cartItemId: string) {
  const parts = cartItemId.split(CART_ITEM_SEPARATOR);
  if (parts.length < 2) return "";
  return parts[1];
}
