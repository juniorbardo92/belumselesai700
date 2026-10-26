const STOP_WORDS = new Set([
  "ada", "agar", "atau", "bagi", "dalam", "dan", "dari", "dengan", "di", "ini", "itu", "ke", "karena",
  "kenapa", "kok", "pada", "tetap", "tapi", "tetapi", "untuk", "yang", "apa", "bisa", "jadi", "cara",
  "a", "an", "and", "are", "for", "from", "how", "in", "is", "of", "on", "or", "the", "to", "why", "with"
]);

const WEAK_QUERY_CONCEPTS = new Set([
  "besar", "banyak", "kering", "kosong", "naik", "ramai", "sehat", "turun"
]);

const TOKEN_ALIASES: Record<string, string> = {
  bisnis: "bisnis",
  business: "bisnis",
  fnb: "bisnis",
  toko: "bisnis",
  umkm: "bisnis",
  usaha: "bisnis",
  cashflow: "cashflow",
  kas: "cashflow",
  biaya: "biaya",
  cost: "biaya",
  costs: "biaya",
  expense: "biaya",
  expenses: "biaya",
  pengeluaran: "biaya",
  customer: "pelanggan",
  customers: "pelanggan",
  konsumen: "pelanggan",
  pelanggan: "pelanggan",
  income: "omzet",
  omset: "omzet",
  omzet: "omzet",
  pemasukan: "omzet",
  pendapatan: "omzet",
  penjualan: "omzet",
  revenue: "omzet",
  sale: "omzet",
  sales: "omzet",
  inventory: "stok",
  stock: "stok",
  stok: "stok",
  capital: "modal",
  modal: "modal",
  keuntungan: "laba",
  laba: "laba",
  profit: "laba",
  profits: "laba",
  untung: "laba",
  ecommerce: "marketplace",
  marketplace: "marketplace",
  anjlok: "turun",
  decrease: "turun",
  down: "turun",
  drop: "turun",
  lesu: "turun",
  menurun: "turun",
  sepi: "turun",
  turun: "turun",
  growth: "naik",
  increase: "naik",
  meningkat: "naik",
  naik: "naik",
  tumbuh: "naik"
};

const BUSINESS_CONCEPTS = new Set([
  "biaya", "bisnis", "cashflow", "laba", "margin", "marketplace", "modal", "omzet", "pelanggan", "produk", "stok"
]);

const BUSINESS_RAW_ANCHORS = new Set([
  "arus", "biaya", "bisnis", "business", "cashflow", "cost", "expense", "fnb", "inventory", "jual", "jualan",
  "kas", "konsumen", "laba", "margin", "marketplace", "modal", "omset", "omzet", "pelanggan", "pengeluaran",
  "penjualan", "produk", "profit", "revenue", "sale", "sales", "stock", "stok", "toko", "umkm", "untung", "usaha"
]);

export const MIN_TOPIC_RELEVANCE_SCORE = 25;

function rawTokens(value: string): string[] {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\barus[\s-]+kas\b/g, "cashflow")
    .replace(/\bcash[\s-]+flow\b/g, "cashflow")
    .replace(/\bmodal[\s-]+kerja\b/g, "modal")
    .replace(/\bf\s*&\s*b\b/g, "fnb");
  return normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function semanticConcepts(value: string): string[] {
  return rawTokens(value)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .map((token) => TOKEN_ALIASES[token] ?? token);
}

function meaningfulQueryConcepts(value: string): string[] {
  return [...new Set(semanticConcepts(value).filter((token) => !WEAK_QUERY_CONCEPTS.has(token)))];
}

function hasBusinessContext(value: string): boolean {
  return rawTokens(value).some((token) => BUSINESS_RAW_ANCHORS.has(token));
}

export function scoreTopicRelevance(text: string, topic: string, keywords: string[]): number {
  const contentConcepts = new Set(semanticConcepts(text));
  const topicConcepts = meaningfulQueryConcepts(topic);
  const topicConceptSet = new Set(topicConcepts);
  const keywordConcepts = [...new Set(
    keywords.flatMap(meaningfulQueryConcepts).filter((concept) => !topicConceptSet.has(concept))
  )];

  const topicMatches = topicConcepts.filter((concept) => contentConcepts.has(concept)).length;
  const keywordMatches = keywordConcepts.filter((concept) => contentConcepts.has(concept)).length;
  const allQueryConcepts = new Set([...topicConcepts, ...keywordConcepts]);
  const businessQuery = [...allQueryConcepts].some((concept) => BUSINESS_CONCEPTS.has(concept));
  const contextMatch = !businessQuery || hasBusinessContext(text);

  let score: number;
  if (topicConcepts.length > 0) {
    const topicCoverage = topicMatches / topicConcepts.length;
    const keywordCoverage = keywordConcepts.length > 0 ? Math.min(1, keywordMatches / Math.min(3, keywordConcepts.length)) : 0;
    score = topicCoverage * 70 + keywordCoverage * 20 + (contextMatch ? 10 : 0);
  } else if (keywordConcepts.length > 0) {
    score = Math.min(1, keywordMatches / Math.min(3, keywordConcepts.length)) * 90 + (contextMatch ? 10 : 0);
  } else {
    score = 0;
  }

  if (businessQuery && !contextMatch) score = Math.min(score, 20);
  return Math.round(Math.min(100, Math.max(0, score)));
}
