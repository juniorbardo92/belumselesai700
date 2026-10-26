# Panglima UMKM — Production Activation Record

Date: 2026-09-22 (Asia/Jakarta)

## Active specialist products

| Lynk product title | Product URL | Module code | APK asset |
| --- | --- | --- | --- |
| Jalur Agen Properti | https://lynk.id/wgunawan168/x4wnrp41mz10 | `property` | `property.pmod` |
| Jalur Agen Asuransi | https://lynk.id/wgunawan168/13xroeodllel | `insurance` | `insurance.pmod` |
| Jalur Mitra MLM | https://lynk.id/wgunawan168/zdkx923vk735 | `mlm` | `mlm.pmod` |

The onboarding matcher uses exact normalized product-title matching. The legacy
`Paket Panglima UMKM` path and its historical variant labels remain supported.

One explicit transaction override is active: transaction
`7e65afdbfae16dae880b61d5ef3db654` with source product `Testing Only` maps to
the `insurance` module. Both the transaction ID and source product title must
match; every other `Testing Only` transaction remains ineligible.

## Production components

- Apps Script project: `Panglima APK UMKM`
- Apps Script project ID: `1_dpT775prbtZ2fcgDVemI4AJnE07fZFFhx8fwkoX2dFVV2aEBL7lod26`
- APK PRE-TEST responder URL:
  `https://docs.google.com/forms/d/e/1FAIpQLSfU-jJ7ZfOeA_x2GQXIKdxS9fm4dM7aFoRKsN0Hu-97f62jJg/viewform`
- Active trigger functions remain unchanged:
  - `panglimaPretestHandleFormSubmit`
  - `panglimaPretestRetryPending`
- Cloudflare relay receiver:
  - Worker: `panglima-lynk-webhook`
  - Active version: `a779c091-14f0-4238-b1cb-c301435b41a7`
  - Deployment: `4459ff97-7864-4c35-a56c-37ce18c8c55f`
- Lynk webhook ingress:
  - Worker: `umkm-monetization-engine`
  - Active version: `d0b5d84b-d042-47c4-bea3-0bc887c8f32c`
  - Deployment: `05d111aa-10dc-4aeb-8857-1954004a4d79`
  - Service binding: `PANGLIMA_LYNK_WEBHOOK`
- Previous monetization baseline retained for rollback:
  - Version: `ec19dcb0-3c61-4b48-a0c1-e9f28cec4397`

## Signed APK release and distribution

- Release file: `Panglima-UMKM-v1.3.0-MODUL.apk`
- Source commit: `907b3bcb530649ce82ac809e9ff7644432b29b5e`
- GitHub Actions build: run `28` (`35722421571`), job `106728142574`
- File size: `6,787,966` bytes
- APK SHA-256:
  `163eaa861b122b6ab186e69c45d95120f4a42019cbf4d72fd6223597bf86e462`
- Signature schemes verified: APK Signature Scheme v1 and v2
- Signing certificate subject:
  `CN=UMKM Naik Kelas, OU=Panglima UMKM, O=Panglima, L=Malang, ST=Jawa Timur, C=ID`
- Signing certificate SHA-256:
  `F9:FA:BA:A3:2D:99:F3:19:26:7F:15:48:AB:F3:1E:A9:C0:F5:AE:B5:B2:44:0C:40:B5:E9:2B:E1:46:DE:75:16`
- The signing certificate matches the previously distributed Panglima APK.
- Persistent release location:
  `/Content OS/Panglima-UMKM-v1.3.0-MODUL.apk`
- Public download:
  `https://panglima-umkm-download.ruang-belajar-mandiri01.workers.dev/Panglima-UMKM-v1.3.0-MODUL.apk`
- Download Worker: `panglima-umkm-download`
  - Active version: `77245aec-8260-4d23-9159-51ae1868b961`
  - Active deployment: `33cf784b-c566-454b-8b17-c8b3622b0866`
  - Rollback version: `cd24f73f-04dc-4558-9d3c-e7f305559297`
  - Rollback deployment: `46d767ff-a357-44da-9d49-32170523c467`
- The Worker root now points to `1.3.0-modul`, and byte-range requests return
  HTTP `206` for resumable downloads.
- The following legacy APK routes remain available and unchanged:
  - `/Panglima-UMKM-v1.2.1-STABIL.apk`
  - `/Panglima-UMKM-v1.2.0-TERKUNCI.apk`
  - `/Panglima-UMKM-v1.1.0-ONLINE.apk`

## Data path

Authenticated Lynk webhook events continue to be recorded by the monetization
engine. A service-bound internal relay also forwards the original validated
payload to the existing Panglima webhook, which writes `Affiliate Transactions`.
The PRE-TEST workbook consumes the same rows through `Payment Mirror`.

Affiliate attribution and commission fields are not changed by the onboarding
matcher. Non-affiliate purchases can be present with `Commission Eligible=NO`
and are still eligible for Panglima onboarding when the exact product title is
one of the three specialist products.

## Verification

- Local regression suite: 102/102 passing.
- GitHub Actions release build completed successfully.
- The APK downloaded from the public Worker is byte-identical to the signed CI
  artifact and has the same production signing certificate.
- APK contents include `property.pmod`, `insurance.pmod`, and `mlm.pmod`; each
  packaged asset hash matches its source asset.
- Apps Script `panglimaPretestDryRun`: completed successfully after deployment.
- APK opens the responder-facing `/viewform` URL; `/formResponse` is not used
  as a navigation target.
- Real control transaction: `7e65afdbfae16dae880b61d5ef3db654` (`Testing Only`).
- Override result: mirrored as `PAID`, commission eligible `NO`, and mapped to
  `insurance` only through the exact transaction-ID + product-title override.
- A different transaction ID with the same `Testing Only` title remains blocked.
- The fixture clones the same payload shape for property, insurance, and MLM
  mapping tests; no full-price purchase was made.

## Sheet documentation

- Registry workbook: `Panglima Affiliate Registry — UMKM Naik Kelas`
  - `Panglima Variant Map`: exact product titles, URLs, module codes, assets,
    ACTIVE status, and the transaction-specific `Testing Only` override.
  - `Affiliate Transactions`: the control transaction is present once.
- PRE-TEST workbook: `Panglima PRE-TEST Responses — Automation`
  - `Payment Mirror`: the control transaction is present once.
  - `Automation Setup`: specialist products, webhook relay, and the insurance
    override are documented in rows 32–36.
