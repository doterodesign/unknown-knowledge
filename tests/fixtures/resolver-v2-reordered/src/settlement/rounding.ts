// Ties-to-even, matching what leaf 610.1 claims governs settlement.
export const roundAtSettlement = (n: number) => {
  const floor = Math.floor(n);
  const diff = n - floor;
  if (diff !== 0.5) return Math.round(n);
  return floor % 2 === 0 ? floor : floor + 1;
};
