/** GST rates in use. 5 / 18 / 40 are the post-Sept-2025 slabs; 12 / 28 kept for legacy items. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28, 40] as const;

export const COMMON_UOMS = ["Kg", "Nos", "Pcs", "Ltr", "Mtr", "Box", "Bag", "Drum", "Roll", "Set", "Ton", "Pkt"];
