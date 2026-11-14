# SEO audit — live release 158

Base: bc6b7e910ebcb8c193ed483508ca18752f3a3ff9. Reviewed 14 November 2026. No production writes or migrations were performed.

## Architecture and panels

| Surface | Existing behavior | SEO boundary |
| --- | --- | --- |
| Panel 0: marketplace | Anonymous JavaScript directory/map at `/` | Public directory HTML and useful discovery links |
| Panel 1: Main Admin | `/mainadmin-pro`, Supabase Admin membership plus existing MFA assurance RPC | `noindex`; platform Google reports only after server-side MFA authorization |
| Panel 2: Owner | `/{slug}/owner`, store membership; settings use existing RLS-protected store_content | `noindex`; SEO editor saves only assigned store content |
| Panel 3: customer storefront | `/{slug}`; anonymous catalogue reads; receipt-based orders/bookings | Public store and item content only; no order, customer or booking records used in SEO |

The current application is plain browser JavaScript, not React. A Cloudflare Worker already bundles static assets and customizes store icons. Previously its initial HTML contained an empty `#app`; titles/descriptions were generic, item details were dialogs with no crawlable item URLs, and there were no dynamic sitemaps or business JSON-LD. The additive Worker renderer preserves the client application and existing overlay/creator presentations after initialization.

## Actual templates

The source defines seven IDs: `retail` (Retail & Clothing), `accommodation`, `salon`, `restaurant`, `cafe`, `bar`, and `professional` (Professional & Creator). This is Retail plus six specialist profiles, rather than six total. Accommodation/salon/professional catalogue items use `/services/{uuid}`; retail and food/drink menu items use `/products/{uuid}`. Existing storefront routes remain unchanged. Creator portfolio entries are not automatically misrepresented as products or priced services.

## Public data and visibility

Read-only production inspection confirmed:
- Anonymous businesses policy requires `active AND billing_paid(id)`.
- Database constraint `business_lifecycle_matches_visibility` requires `active = (lifecycle = 'active')`; deleted, held and closed stores cannot satisfy the anonymous public route.
- Anonymous products/content visibility derives from their public businesses.
- Anonymous access does **not** grant the internal lifecycle column. SEO queries deliberately omit it and rely on the verified RLS/constraint pair.
- Existing `store_content.merchandising` supports additive JSON settings and owner updates under store-membership RLS; existing template authorization remains unchanged.
- No reliable public content/product `updated_at` columns exist. Sitemaps omit `lastmod` rather than pretending creation/publication/request time is a modification time. Adding database-maintained modification timestamps would require a separately approved migration.

The Worker uses only the existing public/publishable key, with no forwarding of user cookies or bearer tokens. Store SEO reads project category, logo, SEO JSON and template ID; no addresses, staff settings, owner records or booking data are selected. Only explicitly supplied public towns/regions/service areas are used. Search opt-out removes a store and its items from SEO discovery/sitemaps and returns noindex, but does not turn a public store into a private one; unpublishing controls access.

## URLs and domains

Current production links are `/{slug}` on enuxes.com / www.enuxes.com. The canonical origin is https://enuxes.com, preserving the path and all existing owner/store links. Tracking/filter query strings do not create new canonicals. There is no per-store custom-domain mapping or validation mechanism in the schema/runtime. No owner-supplied canonical/domain field is introduced. A future per-store domain feature needs verified host ownership and an Admin-controlled primary-domain mapping before changing canonical generation. Preview/nonprimary hosts are noindex; private routes remain noindex/nofollow.

## Search Console

No connected Google Search Console capability or authorized Google property credentials are available in this session. The optional adapter is implemented behind existing Main Admin MFA authorization. It remains disconnected until approved OAuth setup supplies server-only secrets. No sitemap has been submitted and no real Google performance/index status is claimed. See SEARCH_CONSOLE_SETUP.md.

## Relevant primary documentation

- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/docs/appearance/structured-data/local-business
- https://developers.google.com/webmaster-tools/v1/how-tos/authorizing
- https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- https://support.google.com/business/answer/13763036
