# SEO validation and release review

## Automated checks

Run from the live-source checkout:

```sh
npm run build
npm test
git diff --check
```

All 138 tests pass. Tests exercise public/store-specific metadata; all seven template IDs; Product versus Service graphs; truthful offers; breadcrumb positions; script escaping and CSP hashes; existing security headers; opt-out and unpublish exclusions; private-route headers; sitemap sharding at 501 stores/1,001 items; useful product/category/location discovery; anonymous-only data reads; server Admin MFA checks; disconnected Google reporting; OAuth credential containment; explicit same-origin sitemap submission; and existing ordering/booking/creator/overlay tests.

## Browser and upstream checks

- Owner editor checked at 390px and 320px: live title/description preview, character guidance, public fields, Google profile guidance, external-link rejection and search opt-out save using sample data. No horizontal overflow at 320px.
- Real anonymous Supabase API accepted the public relational store/content/product projections. No production writes were performed.
- Built Worker was invoked with real anonymous public data: storefront `/mona` returned HTTP 200, meaningful initial HTML, JSON-LD and canonical `https://enuxes.com/mona`; sitemap index returned HTTP 200.
- Local upstream round trips were roughly six seconds. Earlier five-second limits timed out; rendering now uses one bounded store/content/catalogue request with a ten-second limit. A failed upstream read returns noindex HTTP 503 with the existing client shell, not an indexable empty catalogue. This is not a Core Web Vitals or production-edge performance pass. Benchmark initial response and mobile vitals from the deployed edge after deployment approval; do not claim a speed improvement from local results.
- CSS and markup maintain the existing hydrated storefront designs. The only shared storefront accessibility change permits pinch zoom.

## Google Rich Results Test

Code-mode validation was run against a generated sample Product page on 14 November 2026. Google detected three valid items: Product snippets, Merchant listings and Breadcrumbs. Merchant listings reported three optional issues: no global identifier/brand, no merchant return policy and no shipping details. The implementation deliberately does not invent these business facts. This is sample-code validation, not a test of a deployed storefront URL or proof of indexing/ranking. Result: https://search.google.com/test/rich-results/result?id=y3Go2xz7EYMk8SsZUVCdJw

## Known limits and approval gates

No production deployment, database migration, Google profile creation/claim, Google OAuth connection, sitemap submission or URL indexing claim has been performed. Search Console requires separately authorized Google property access and server-only configuration. Bulk indexed-page totals are explicitly unavailable; individual authorized URL Inspection is supported.

No accurate public modification timestamps exist for store content/products. Sitemap lastmod is intentionally omitted. A future database-maintained updated_at migration requires separate approval. Per-store custom domains are absent; only the verified platform canonical origin is used. Discovery groups require at least two eligible businesses with meaningful public descriptions; no empty or artificial keyword pages are generated. Storefront initial catalogue HTML is bounded to 100 genuine items; all eligible item URLs remain available through sharded sitemaps and direct detail routes. Directory builders cap scans at 50,000 rows and fail with a retryable status instead of serving silently truncated results; larger directories should use a separately reviewed pagination/indexing change.

## Review base

The running application source is live release 158, commit `bc6b7e910ebcb8c193ed483508ca18752f3a3ff9`. The connected GitHub main branch was last updated on 8 November and is older than that source. The draft GitHub PR carries an apply-ready patch against release 158, with audit and validation documentation. It is a review artifact, not an instruction to deploy or overwrite current live source from the older GitHub main branch.
