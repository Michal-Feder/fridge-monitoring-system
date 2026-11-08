// Branch and fridge names are typed by hand: "tel aviv", "Tel  Aviv " and "Tel Aviv" are the same place.
export function cleanName(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export function nameKey(s: string): string {
  return cleanName(s).toLocaleLowerCase('en');
}

/**
 * Maps every raw spelling to one canonical name. Existing (known) names always win.
 * Otherwise the most frequent spelling wins; on a tie, the one with more capital letters
 * ("Tel Aviv" beats "tel aviv").
 */
export function canonicalize(rawNames: string[], known: string[] = []): Map<string, string> {
  const knownByKey = new Map(known.map((k) => [nameKey(k), cleanName(k)]));
  const variants = new Map<string, Map<string, number>>();
  for (const raw of rawNames) {
    const c = cleanName(raw);
    if (!c) continue;
    const k = nameKey(c);
    const m = variants.get(k) ?? new Map<string, number>();
    m.set(c, (m.get(c) ?? 0) + 1);
    variants.set(k, m);
  }
  const caps = (s: string) => (s.match(/\p{Lu}/gu) ?? []).length;
  const canonicalByKey = new Map<string, string>();
  for (const [k, m] of variants) {
    if (knownByKey.has(k)) { canonicalByKey.set(k, knownByKey.get(k)!); continue; }
    const best = [...m.entries()].sort((a, b) => b[1] - a[1] || caps(b[0]) - caps(a[0]) || a[0].localeCompare(b[0]))[0][0];
    canonicalByKey.set(k, best);
  }
  const out = new Map<string, string>();
  for (const raw of rawNames) {
    const c = cleanName(raw);
    if (c) out.set(raw, canonicalByKey.get(nameKey(c))!);
  }
  return out;
}

/** Logger ids: "tl-0417", "TL 0417", "TL0417" -> "TL-0417". Other shapes are only trimmed and upper-cased. */
export function normalizeLoggerId(raw: string): string {
  const c = cleanName(raw).toUpperCase();
  const m = /^([A-Z]{1,4})[\s\-_]?(\d{2,})$/.exec(c);
  return m ? `${m[1]}-${m[2]}` : c;
}

export function looksLikeLoggerId(raw: string): boolean {
  return /^[A-Za-z]{1,4}[\s\-_]?\d{2,}$/.test(cleanName(raw));
}

/** D26: take the logger id from a file name such as "TL-0240_week38.csv". */
export function loggerIdFromFilename(name: string): string | null {
  const m = /([A-Za-z]{2,4})[\s\-_]?(\d{3,})/.exec(name);
  return m ? normalizeLoggerId(`${m[1]}-${m[2]}`) : null;
}
