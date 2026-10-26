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
