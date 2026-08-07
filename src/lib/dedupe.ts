/** Stable dedupe hash so a CSV row and the matching alert email collapse to one transaction.
 * Uses date + amount + normalized merchant (lowercased, non-alphanumerics stripped, first 12 chars). */
export function dedupeHash(date: string, amountCents: number, merchant: string, direction: string): string {
  const norm = merchant.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
  return `${date}|${amountCents}|${direction}|${norm}`
}
