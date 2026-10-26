import React, { useEffect, useState } from 'react';
import { PROMO } from '@/data/site';

function calc(target) {
  const diff = new Date(target).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return null;
  return {
    hari: Math.floor(diff / 86400000),
    jam: Math.floor((diff / 3600000) % 24),
    menit: Math.floor((diff / 60000) % 60),
    detik: Math.floor((diff / 1000) % 60),
  };
}

export default function Countdown({ deadline = PROMO.deadline, tone = 'dark', className = '' }) {
  const [left, setLeft] = useState(() => calc(deadline));

  useEffect(() => {
    setLeft(calc(deadline));
    const id = setInterval(() => setLeft(calc(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!left) {
    return <p className={`text-sm font-semibold ${className}`}>Periode promo telah berakhir.</p>;
  }

  const box =
    tone === 'dark'
      ? 'bg-white/10 text-white ring-1 ring-white/15'
      : 'bg-neutral-900 text-white';

  return (
    <div className={`flex gap-2 ${className}`}>
      {Object.entries(left).map(([label, value]) => (
        <div key={label} className={`min-w-[62px] rounded-xl px-3 py-2 text-center ${box}`}>
          <span className="block font-display text-2xl leading-none tabular-nums">
            {String(value).padStart(2, '0')}
          </span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.18em] opacity-70">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
