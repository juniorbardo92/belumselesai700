import React from 'react';
import { Link } from 'react-router-dom';
import { Check, ArrowRight, ChevronRight } from 'lucide-react';

export function Kicker({ children, tone = 'light' }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.24em] ${tone === 'dark' ? 'text-[hsl(var(--gold))]' : 'text-primary'
        }`}
    >
      <span className="h-px w-6 bg-current" />
      {children}
    </span>
  );
}

export function SectionTitle({ children, className = '' }) {
  return (
    <h2 className={`font-display text-4xl leading-[1.05] text-neutral-900 sm:text-5xl ${className}`}>{children}</h2>
  );
}

export function ProductCard({ product, compact = false }) {
  return (
    <article
      className={`relative flex flex-col rounded-2xl p-6 ring-1 transition-transform duration-200 hover:-translate-y-1 ${product.highlight
          ? 'bg-[hsl(var(--ink))] text-white ring-white/10'
          : 'bg-white text-neutral-900 ring-black/10'
        }`}
    >
      {(product.popular || product.promo) && (
        <span className="absolute -top-3 left-6 rounded-full bg-[hsl(var(--gold))] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-900">
          {product.promo ? 'Promo terbatas' : 'Paling direkomendasikan'}
        </span>
      )}
      <p className={`text-xs font-bold uppercase tracking-[0.2em] ${product.highlight ? 'text-[hsl(var(--gold))]' : 'text-primary'}`}>
        {product.short}
      </p>
      <h3 className="mt-2 font-display text-2xl leading-tight">{product.name}</h3>
      <p className={`mt-2 text-sm leading-relaxed ${product.highlight ? 'text-neutral-300' : 'text-neutral-600'}`}>
        {product.desc}
      </p>
      {!compact && (
        <ul className="mt-5 space-y-2.5 text-sm">
          {product.features.map((f) => (
            <li key={f} className="flex gap-2.5">
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${product.highlight ? 'text-[hsl(var(--gold))]' : 'text-primary'}`} strokeWidth={2.5} />
              <span className={product.highlight ? 'text-neutral-300' : 'text-neutral-700'}>{f}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex items-end justify-between gap-3 pt-2">
        <div>
          {product.oldPrice && (
            <span className={`block text-xs line-through ${product.highlight ? 'text-neutral-500' : 'text-neutral-400'}`}>
              {product.oldPrice}
            </span>
          )}
          <span className="block font-display text-2xl">{product.price}</span>
          {product.note && (
            <span className={`mt-0.5 block text-[10px] leading-snug ${product.highlight ? 'text-neutral-400' : 'text-neutral-500'}`}>
              {product.note}
            </span>
          )}
        </div>
        <a
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground transition-transform active:scale-[0.98]"
        >
          Beli <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}

export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-neutral-500">
      {items.map((item, i) => (
        <span key={item.href || item.label} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {item.href ? (
            <Link to={item.href} className="hover:text-primary">{item.label}</Link>
          ) : (
            <span className="text-neutral-800">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHero({ kicker, title, subtitle, children }) {
  return (
    <section className="relative overflow-hidden bg-[hsl(var(--ink))] px-5 py-16 text-white sm:py-20">
      <div className="pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-primary/30 blur-3xl" />
      <div className="relative mx-auto max-w-[72rem]">
        <Kicker tone="dark">{kicker}</Kicker>
        <h1 className="mt-4 max-w-3xl font-display text-5xl leading-[1] sm:text-6xl">{title}</h1>
        {subtitle && <p className="mt-4 max-w-2xl text-base leading-relaxed text-neutral-300">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

(() => {
  const MID = "G-4ROTPE9C1F";
  const WORKER =
    "https://umkm-monetization-engine.ruang-belajar-mandiri01.workers.dev";

  const ROUTES = {
    "9rov84wv3grz": "kas-umkm-lynk",
    "13xroeodllel": "agen-asuransi",
    "x4wnrp41mz10": "agen-properti",
    "zdkx923vk735": "mlm-direct-selling"
  };

  function getProduct(href) {
    try {
      const u = new URL(href, location.href);

      if (
        u.hostname.replace(/^www\./, "").toLowerCase()
        !== "lynk.id"
      ) return null;

      const p = u.pathname.split("/").filter(Boolean);

      if (
        p[0]?.toLowerCase() !== "wgunawan168" ||
        !ROUTES[p[1]]
      ) return null;

      return p[1];
    } catch {
      return null;
    }
  }

  function gaValue(field) {
    return new Promise(resolve => {
      if (typeof window.gtag !== "function") {
        resolve(null);
        return;
      }

      let finished = false;

      const done = value => {
        if (finished) return;
        finished = true;

        resolve(
          value == null
            ? null
            : String(value).trim() || null
        );
      };

      const timer = setTimeout(
        () => done(null),
        1500
      );

      try {
        window.gtag(
          "get",
          MID,
          field,
          value => {
            clearTimeout(timer);
            done(value);
          }
        );
      } catch {
        clearTimeout(timer);
        done(null);
      }
    });
  }

  async function makeUrl(slug) {
    const u = new URL(
      `${WORKER}/go/${slug}`
    );

    u.searchParams.set(
      "src",
      "website"
    );

    const [cid, sid] =
      await Promise.all([
        gaValue("client_id"),
        gaValue("session_id")
      ]);

    if (
      cid &&
      /^\d+\.\d+$/.test(cid)
    ) {
      u.searchParams.set(
        "ga_cid",
        cid
      );
    }

    if (
      sid &&
      /^\d+$/.test(sid)
    ) {
      u.searchParams.set(
        "ga_sid",
        sid
      );
    }

    return u.toString();
  }

  async function convert(a) {
    if (
      !(a instanceof HTMLAnchorElement) ||
      a.dataset.umkmGa4Bridge === "1"
    ) return;

    const product =
      getProduct(a.href);

    if (!product) return;

    a.dataset.umkmGa4Bridge = "1";

    const slug =
      ROUTES[product];

    try {
      a.href =
        await makeUrl(slug);
    } catch {
      a.href =
        `${WORKER}/go/${slug}?src=website`;
    }
  }

  function scan(root = document) {
    root
      .querySelectorAll?.("a[href]")
      .forEach(convert);
  }

  if (
    document.readyState === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      () => scan(),
      { once: true }
    );
  } else {
    scan();
  }

  new MutationObserver(
    mutations => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(
          node => {
            if (node instanceof Element) {
              if (
                node instanceof
                HTMLAnchorElement
              ) {
                convert(node);
              }

              scan(node);
            }
          }
        );
      }
    }
  ).observe(
    document.documentElement,
    {
      childList: true,
      subtree: true
    }
  );
})();