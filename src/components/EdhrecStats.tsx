import React, { useEffect, useState } from 'react';
import { getCommanderData } from '../services/edhrec';
import { Users, Activity } from 'lucide-react';

export const CommanderDeckCount: React.FC<{ commanderName: string }> = ({ commanderName }) => {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getCommanderData(commanderName).then(data => {
      if (active && data) {
        setCount(data.numDecks);
      }
    });
    return () => { active = false; };
  }, [commanderName]);

  if (!count) return null;

  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded shadow-lg bg-slate-950/90 backdrop-blur-sm border border-fuchsia-500/70 text-[10px] font-bold text-fuchsia-300" title={`${count.toLocaleString()} decks on EDHREC`}>
      <Users className="w-3 h-3" />
      <span>{count >= 1000 ? (count / 1000).toFixed(1) + 'k' : count} decks</span>
    </div>
  );
};

export const CardSynergyPercentage: React.FC<{ commanderName: string, cardName: string }> = ({ commanderName, cardName }) => {
  const [percentage, setPercentage] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    getCommanderData(commanderName).then(data => {
      if (active && data) {
        const cleanCardName = cardName.split(' // ')[0].trim().toLowerCase();
        const pct = data.cardMap.get(cleanCardName) ?? data.cardMap.get(cardName.toLowerCase());
        if (pct !== undefined) {
          setPercentage(pct * 100);
        }
      }
    });
    return () => { active = false; };
  }, [commanderName, cardName]);

  if (percentage === null) return null;

  return (
    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded shadow-lg bg-slate-950/90 backdrop-blur-sm border border-emerald-500/70 text-[10px] font-bold text-emerald-300" title={`${percentage.toFixed(1)}% of ${commanderName} decks use this card`}>
      <Activity className="w-3 h-3" />
      <span>{percentage >= 1 ? Math.round(percentage) : percentage.toFixed(1)}%</span>
    </div>
  );
};
