export function contactDiffersFromPrefill(
  saved: { realName?: string | null; phone?: string | null } | null | undefined,
  submitted: { name: string; phone: string },
): boolean {
  return (
    (saved?.realName ?? "").trim() !== submitted.name.trim() ||
    (saved?.phone ?? "").trim() !== submitted.phone.trim()
  );
}
