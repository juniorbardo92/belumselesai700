import assert from "node:assert/strict";
import test from "node:test";

import {
  KALYANAMITRA_BRAND_ID,
  applyBrandIdentity,
  resolveBrandProfile
} from "./brand-profile.mjs";

const baseDesign = {
  preset: "brand",
  colors: {
    background: "#ffffff",
    primary: "#9e1b13",
    accent: "#c69a3d",
    text: "#111111"
  },
  logo: { url: "https://media.umkmnaikkelas.id/old-logo.jpg", position: "top-left", size: "small" },
  slides: {}
};

test("exact ledger brand id selects Ruang Kalyanamitra", () => {
  const brand = resolveBrandProfile(KALYANAMITRA_BRAND_ID);
  assert.equal(brand.id, "ruang-kalyanamitra");
  assert.equal(brand.label, "Ruang Kalyanamitra");
  assert.equal(brand.fallbackMark, "RK");
});

test("unknown or user-controlled draft identity cannot select Ruang Kalyanamitra", () => {
  for (const value of [
    undefined,
    "ruang-kalyanamitra",
    "Brand-Ruang-Kalyanamitra",
    { title: "Ruang Kalyanamitra", metadata: { namespace: "ruang-kalyanamitra" } }
  ]) {
    const brand = resolveBrandProfile(value);
    assert.equal(brand.id, "umkm-naik-kelas");
    assert.equal(brand.label, "UMKM Naik Kelas");
  }
});

test("UMKM design remains byte-for-byte equivalent", () => {
  const brand = resolveBrandProfile("brand-umkm-naik-kelas");
  assert.strictEqual(applyBrandIdentity(baseDesign, brand, null), baseDesign);
});

test("Kalyanamitra identity overrides an unrelated design logo and UMKM colors", () => {
  const brand = resolveBrandProfile(KALYANAMITRA_BRAND_ID);
  const result = applyBrandIdentity(baseDesign, brand, "data:image/webp;base64,candidate1");
  assert.deepEqual(result.logo, {
    url: "data:image/webp;base64,candidate1",
    position: "top-right",
    size: "large"
  });
  assert.deepEqual(result.colors, {
    background: "#fffaf0",
    primary: "#0b2f64",
    accent: "#d5a62f",
    text: "#172033"
  });
});

test("Kalyanamitra fails closed when the official logo is missing", () => {
  const brand = resolveBrandProfile(KALYANAMITRA_BRAND_ID);
  assert.throws(
    () => applyBrandIdentity(baseDesign, brand, null),
    /Logo resmi Ruang Kalyanamitra tidak tersedia/
  );
});
