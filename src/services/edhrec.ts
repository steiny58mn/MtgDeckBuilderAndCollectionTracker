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
  const sanitized = sanitizeCardName(commanderName);
  if (edhrecCache.has(sanitized)) {
    return edhrecCache.get(sanitized)!;
  }

  const promise = fetch(`https://json.edhrec.com/pages/commanders/${sanitized}.json`)
    .then((res) => {
      if (!res.ok) return null;
      return res.json();
    })
    .then((data) => {
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
