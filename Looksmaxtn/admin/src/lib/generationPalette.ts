export interface PaletteColor {
  name: string;
  hex: string;
}

export const SECONDARY_GARMENT_PALETTE: PaletteColor[] = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
  { name: "Sand Beige", hex: "#D6C9B0" },
  { name: "Warm Taupe", hex: "#B8A48A" },
  { name: "Camel", hex: "#A87E5A" },
  { name: "Khaki", hex: "#8C7B5B" },
  { name: "Olive", hex: "#5C6233" },
  { name: "Clay Brown", hex: "#7A4E3B" },
  { name: "Cocoa", hex: "#4A2E1F" },
  { name: "Stone Gray", hex: "#9A9286" },
];

export const SHOES_PALETTE: PaletteColor[] = [
  { name: "Black", hex: "#000000" },
  { name: "White", hex: "#FFFFFF" },
];

export const DEFAULT_TOP_ZONE_PANTS = SECONDARY_GARMENT_PALETTE[0];
export const DEFAULT_BOTTOM_ZONE_TOP = SECONDARY_GARMENT_PALETTE[1];
export const DEFAULT_SHOES = SHOES_PALETTE[1];
