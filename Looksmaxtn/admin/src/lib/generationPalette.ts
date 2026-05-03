export interface PaletteColor {
  name: string;
  hex: string;
}

export const SECONDARY_GARMENT_PALETTE: PaletteColor[] = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Beige", hex: "#D8C3A5" },
  { name: "Brown", hex: "#8D6E63" },
  { name: "Olive", hex: "#6B7B4D" },
  { name: "Navy", hex: "#1F3A5F" },
  { name: "Red", hex: "#D32F2F" },
  { name: "Green", hex: "#2E7D32" },
  { name: "Blue", hex: "#1565C0" },
  { name: "Gray", hex: "#757575" },
];

export const SHOES_PALETTE: PaletteColor[] = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
];

export const DEFAULT_TOP_ZONE_PANTS = SECONDARY_GARMENT_PALETTE[0];
export const DEFAULT_BOTTOM_ZONE_TOP = SECONDARY_GARMENT_PALETTE[1];
export const DEFAULT_SHOES = SHOES_PALETTE[1];
