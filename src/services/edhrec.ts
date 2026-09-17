export interface EdhrecCommanderStats {
  numDecks: number;
  cardMap: Map<string, number>;
}

const edhrecCache = new Map<string, Promise<EdhrecCommanderStats | null>>();

function sanitizeCardName(name: string): string {
  const baseName = name.split(' // ')[0].trim();
  return baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function getCommanderData(commanderName: string): Promise<EdhrecCommanderStats | null> {
  if (!commanderName || commanderName.trim() === '') {
    return Promise.resolve(null);
  }

  const sanitized = sanitizeCardName(commanderName);
  if (edhrecCache.has(sanitized)) {
    return edhrecCache.get(sanitized)!;
  }

  // Use proxy route to bypass browser CORS and 403 restrictions
  const proxyUrl = `/api/edhrec/pages/commanders/${sanitized}.json`;

  const promise = fetch(proxyUrl)
    .then(async (res) => {
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      return res.json();
    })
    .then((data) => {
      if (!data) return null;
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
    })
    .catch(() => null);

  edhrecCache.set(sanitized, promise);
  return promise;
}
