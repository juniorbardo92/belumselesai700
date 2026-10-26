export type AutomationPlatform = "instagram" | "threads";

export type BrandRoute = {
  brandId: string;
  namespace: string;
  handle: string;
  platform: AutomationPlatform;
  accountId: string;
};

const ROUTES: readonly BrandRoute[] = Object.freeze([
  {
    brandId: "brand-umkm-naik-kelas",
    namespace: "umkm-naik-kelas",
    handle: "umkmnaikkelas.id",
    platform: "instagram",
    accountId: "6a8e2fac62caae1e04063415"
  },
  {
    brandId: "brand-umkm-naik-kelas",
    namespace: "umkm-naik-kelas",
    handle: "umkmnaikkelas.id",
    platform: "threads",
    accountId: "6a8e2fc362caae1e04063419"
  },
  {
    brandId: "brand-ruang-kalyanamitra",
    namespace: "ruang-kalyanamitra",
    handle: "ruangkalyanamitra",
    platform: "instagram",
    accountId: "6a8d2c6762caae1e04053962"
  },
  {
    brandId: "brand-ruang-kalyanamitra",
    namespace: "ruang-kalyanamitra",
    handle: "ruangkalyanamitra",
    platform: "threads",
    accountId: "6a8d2c7862caae1e0405397a"
  }
]);

export function getBrandRoute(brandId: string, platform: AutomationPlatform): BrandRoute | null {
  return ROUTES.find((route) => route.brandId === brandId && route.platform === platform) ?? null;
}

export function isKnownBrand(brandId: string): boolean {
  return ROUTES.some((route) => route.brandId === brandId);
}

export function routeMatchesAccount(
  route: BrandRoute,
  account: { id: string; username: string; type: string }
): boolean {
  const username = account.username.replace(/^@/, "").toLowerCase();
  return (
    account.id === route.accountId &&
    account.type.toLowerCase() === route.platform &&
    username === route.handle.toLowerCase()
  );
}

export function listBrandRoutes(): readonly BrandRoute[] {
  return ROUTES;
}
