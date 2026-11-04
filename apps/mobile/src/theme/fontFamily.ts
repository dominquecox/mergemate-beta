/** Choose bundled static font faces without relying on synthetic browser bold. Weights above 600 use SemiBold. */
export function fontFamilyForWeight(family?: string, weight?: string | number): string {
  if (family && !family.startsWith('Geist_')) return family;
  if (weight === undefined) return family ?? 'Geist_400Regular';
  const numeric = weight === 'bold' ? 700 : weight === 'normal' ? 400 : Number(weight);
  // The app caps text at SemiBold: heavier faces made dense screens hard to read.
  if (numeric >= 600) return 'Geist_600SemiBold';
  if (numeric >= 500) return 'Geist_500Medium';
  return 'Geist_400Regular';
}
