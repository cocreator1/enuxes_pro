# Authorized Google Search Console setup

Status: adapter prepared; not connected; no production deployment or Google property changes have been made.

1. The platform owner must verify the enuxes.com Domain property in Google Search Console (or choose the existing verified URL-prefix property). DNS verification and Google account authorization require the account owner's access.
2. In a Google Cloud project controlled by the platform owner, enable Search Console API, configure OAuth consent, and authorize the desired scopes. Read-only reporting/inspection uses `https://www.googleapis.com/auth/webmasters.readonly`. Sitemap submission additionally requires `https://www.googleapis.com/auth/webmasters` and explicit owner consent.
3. Obtain an authorized offline refresh token through Google's supported OAuth flow. Do not paste credentials into source code, a public repo, Owner forms or chat.
4. After approval, configure server-side encrypted runtime secrets `GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN` and optionally `GSC_PROPERTY`. The property defaults to `sc-domain:enuxes.com`; only verified platform origin variants are accepted. Never set these as public browser configuration.
5. After deployment approval, Main Admin → SEO & Google discovery → Refresh report. The server calls the existing `platform_admin_mfa_state` RPC for every request; customers and owners cannot obtain platform metrics. This release does not expose store-level query reports.
6. Submit the platform sitemap using the explicit Admin button (requires write scope), or submit https://enuxes.com/sitemap.xml in Search Console directly. Submission is a hint and does not guarantee crawling or indexing.
7. Inspect a published storefront slug to see Google's indexed version, last crawl and verdict. This is not a live URL test. Bulk indexed-page totals are not available in this adapter. Sitemap errors/warnings are distinct from individual URL indexing errors.

Metrics use actual API responses: final web-search data for a 28-day range ending three days before today, aggregate clicks/impressions/position and the top 100 available query rows. Missing data remains unavailable, not zero. Google may omit rows. Internal Overview store visits are never labelled Google search performance. Tokens are refreshed in server memory and never returned or logged.

After the production release is approved, run Google's Rich Results Test against the deployed product/service pages and URL Inspection against verified storefront URLs. Local JSON-LD validation tests do not establish Google rich-result eligibility, indexing or rankings. LocalBusiness rich-result requirements (including an appropriate published address) may not be met by service-area/online-only profiles; this implementation does not invent addresses to satisfy them.
