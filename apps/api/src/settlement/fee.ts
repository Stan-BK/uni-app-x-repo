export function settlementAmounts(
  grossCents: number,
  refundedCents: number,
  platformFeeBps: number | null,
) {
  const collectedCents = grossCents - refundedCents;
  const bps = Math.min(10000, Math.max(0, platformFeeBps ?? 0));
  const rawFee = Math.round((collectedCents * bps) / 10000);
  const feeCents = Math.min(collectedCents, Math.max(0, rawFee));
  return {
    collectedCents,
    feeCents,
    netCents: collectedCents - feeCents,
  };
}
