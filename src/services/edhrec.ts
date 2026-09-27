export interface EdhrecCommanderStats {
  numDecks: number;
  cardMap: Map<string, number>;
}

const edhrecCache = new Map<string, Promise<EdhrecCommanderStats | null>>();

export function sanitizeCardName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (accents)
    .toLowerCase()
    .replace(/['’"`.]/g, '') // remove apostrophes, quotes, periods
    .replace(/[^a-z0-9]+/g, '-') // convert remaining non-alphanumeric chars to dashes
    .replace(/^-+|-+$/g, ''); // strip leading/trailing dashes
}

/**
 * Returns candidate EDHREC URL slugs for a commander or partner pair.
 * EDHREC partner pages are typically formatted alphabetically (e.g. krav-the-unredeemed-regna-the-redeemer).
 */
export function getCommanderCandidateSlugs(commanderName: string): string[] {
  if (!commanderName) return [];
  const parts = commanderName.split(' // ').map((p) => p.trim()).filter(Boolean);
  if (parts.length > 1) {
    const slug1 = sanitizeCardName(parts[0]);
    const slug2 = sanitizeCardName(parts[1]);
    const alphaPair = [slug1, slug2].sort((a, b) => a.localeCompare(b));
    return [
      `${alphaPair[0]}-${alphaPair[1]}`,
      `${slug1}-${slug2}`,
      `${slug2}-${slug1}`,
      slug1,
      slug2,
    ];
  }
  return [sanitizeCardName(parts[0])];
}

export function getCommanderData(commanderName: string): Promise<EdhrecCommanderStats | null> {
  if (!commanderName) return Promise.resolve(null);
  const cacheKey = commanderName.trim().toLowerCase();
  if (edhrecCache.has(cacheKey)) {
    return edhrecCache.get(cacheKey)!;
  }

  const promise = (async () => {
    const slugs = getCommanderCandidateSlugs(commanderName);
    for (const slug of slugs) {
      if (!slug) continue;
      try {
        const res = await fetch(`/api/edhrec/pages/commanders/${slug}.json`);
        if (!res.ok) continue;

        const data = await res.json();
        if (data?.notFound) continue;

        const numDecks = data?.container?.json_dict?.card?.num_decks || 0;
        const cardMap = new Map<string, number>();

        const cardlists = data?.container?.json_dict?.cardlists || [];
        for (const list of cardlists) {
          for (const card of list.cardviews || []) {
            if (card.name && card.num_decks && card.potential_decks) {
              cardMap.set(card.name.toLowerCase(), card.num_decks / card.potential_decks);
            }
          }
        }
        return { numDecks, cardMap };
      } catch {
        // try next candidate slug
      }
    }
    return null;
  })();

  edhrecCache.set(cacheKey, promise);
  return promise;
}
