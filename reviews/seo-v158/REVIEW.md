# eNuxes automated SEO — review package

This implementation is prepared against the source of live **release 158**, commit `bc6b7e910ebcb8c193ed483508ca18752f3a3ff9`.

The connected GitHub `main` branch is older (8 November). The draft review PR therefore carries an apply-ready patch against the current live source instead of replacing the application with that older mirror. Merging the review-artifact PR alone does not install or deploy the feature.

## Review the implementation

- `AUDIT.md`: four panels, seven actual template IDs, visibility/RLS, URL and domain architecture.
- `VALIDATION.md`: 138 passing tests, build, browser checks, real anonymous API/Worker checks, Google code-test result, performance limits.
- `SEARCH_CONSOLE_SETUP.md`: authorized Google setup and server-only secret configuration; no credentials are embedded.
- `enuxes-seo-v158.patch`: complete source changes and tests, including the documentation above.

## Apply to the correct base after review

Use the current Sites source checkout or a matching source export. Do not apply the patch to the older GitHub main tree.

```sh
git switch -c feature/automated-storefront-seo bc6b7e910ebcb8c193ed483508ca18752f3a3ff9
git apply --check enuxes-seo-v158.patch
git apply enuxes-seo-v158.patch
npm run build
npm test
```

The patch does not include a database migration or generated Worker bundle. `npm run build` generates the Worker bundle using the existing packaging workflow. No new dependency or paid integration is required by the code.

## Approval boundary

No deployment, production database change, Google OAuth connection or sitemap submission has been performed. Review and approve the source changes before deployment. Google Search Console stays disconnected until the platform owner separately authorizes its property and configures server-side OAuth secrets. Actual indexing, ranking and production mobile performance must not be inferred from local tests or a sample-code Rich Results Test.
