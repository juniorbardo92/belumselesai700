import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { PROMO } from '@/data/site';
import Countdown from '@/components/Countdown';

export default function PromoPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!PROMO.active) return undefined;
    const show = setTimeout(() => setOpen(true), 2500);
    return () => clearTimeout(show);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const hide = setTimeout(() => setOpen(false), 10000);
    return () => clearTimeout(hide);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ duration: 0.28, ease: 'easeOut' }}
          role="dialog"
          aria-label={PROMO.title}
          className="fixed inset-x-4 bottom-4 z-50 overflow-hidden rounded-2xl bg-[hsl(var(--ink))] p-5 text-white shadow-2xl ring-1 ring-white/10 sm:left-auto sm:right-6 sm:w-[380px]"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/40 blur-2xl" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup promo"
            className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/80 transition hover:bg-white/20"
          >
            <X className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--gold))]/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(var(--gold))]">
            <Sparkles className="h-3.5 w-3.5" /> {PROMO.title}
          </span>
          <p className="mt-3 pr-8 text-sm leading-relaxed text-neutral-300">{PROMO.message}</p>
          <Countdown className="mt-4" />
          <a
            href={PROMO.ctaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex min-h-[46px] w-full items-center justify-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground active:scale-[0.98]"
          >
            {PROMO.ctaLabel} <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
