export const KALYANAMITRA_BRAND_ID = "brand-ruang-kalyanamitra";

const UMKM_BRAND = Object.freeze({
  id: "umkm-naik-kelas",
  label: "UMKM Naik Kelas",
  logoAlt: "Logo UMKM Naik Kelas",
  fallbackMark: "UM",
  hookEyebrow: "Catatan penting",
  logoAsset: null,
  logoMimeType: null,
  colors: null
});

const KALYANAMITRA_BRAND = Object.freeze({
  id: "ruang-kalyanamitra",
  label: "Ruang Kalyanamitra",
  logoAlt: "Logo Ruang Kalyanamitra",
  fallbackMark: "RK",
  hookEyebrow: "Refleksi Dharma",
  logoAsset: "ruang-kalyanamitra-logo.webp",
  logoMimeType: "image/webp",
  colors: Object.freeze({
    background: "#fffaf0",
    primary: "#0b2f64",
    accent: "#d5a62f",
    text: "#172033"
  })
});

export function resolveBrandProfile(brandId) {
  return brandId === KALYANAMITRA_BRAND_ID ? KALYANAMITRA_BRAND : UMKM_BRAND;
}

export function applyBrandIdentity(design, brand, officialLogoUrl) {
  if (brand.id !== KALYANAMITRA_BRAND.id) return design;
  if (
    typeof officialLogoUrl !== "string" ||
    !officialLogoUrl.startsWith(`data:${brand.logoMimeType};base64,`)
  ) {
    throw new Error("Logo resmi Ruang Kalyanamitra tidak tersedia");
  }

  return {
    ...design,
    colors: { ...design.colors, ...brand.colors },
    logo: {
      url: officialLogoUrl,
      position: "top-right",
      size: "large"
    }
  };
}
