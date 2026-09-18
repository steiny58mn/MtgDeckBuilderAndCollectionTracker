export interface EdhrecCommanderStats {
  numDecks: number;
  cardMap: Map<string, number>;
}

const edhrecCache = new Map<string, Promise<EdhrecCommanderStats | null>>();

export function sanitizeCardName(name: string): string {
  if (!name) return '';
  const baseName = name.split(' // ')[0].trim();
  return baseName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics (accents)
    .toLowerCase()
    .replace(/['’"`.]/g, '') // remove apostrophes, quotes, periods
    .replace(/[^a-z0-9]+/g, '-') // convert remaining non-alphanumeric chars to dashes
    .replace(/^-+|-+$/g, ''); // strip leading/trailing dashes
}

export function getCommanderData(commanderName: string): Promise<EdhrecCommanderStats | null> {
  const sanitized = sanitizeCardName(commanderName);
  if (!sanitized) return Promise.resolve(null);

  if (edhrecCache.has(sanitized)) {
    return edhrecCache.get(sanitized)!;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`/api/edhrec/pages/commanders/${sanitized}.json`);
      if (!res.ok) {
        return null;
      }

      const data = await res.json();
      if (data?.notFound) {
        return null;
      }

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
      return null;
    }
  })();

  edhrecCache.set(sanitized, promise);
  return promise;
}
