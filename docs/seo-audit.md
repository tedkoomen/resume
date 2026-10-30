# Critical Section: SEO review

Reviewed the generated site, repository, and Google Search Central guidance as part of the Critical Section redesign. Scope: homepage, archive, About, three articles, and the standalone résumé. This is a technical/content review, not a Search Console traffic or ranking report.

## Changes implemented

- Replaced the old site identity across page titles, navigation, About, manifest, favicon, résumé, and all four social cards. Homepage no longer repeats the site name twice in its title.
- Added the missing About canonical and made canonical and sitemap URLs consistently use the production HTTPS host and trailing slash. Existing article URLs and prose are preserved.
- Added an XML sitemap covering all seven indexable pages, including the résumé outside Gatsby's page graph. Production robots.txt advertises it. Preview/branch deployment crawling remains disallowed.
- Added server-rendered JSON-LD for WebSite, Person, BlogPosting, and profile pages. Article records include their real publication dates, headline, description, canonical, author profile, and image. No invented modification dates, reviews, or credentials.
- Added distinct About/archive descriptions, an explicit noindex 404 page, linked author bylines, and related-article links.
- Updated article and site social cards to use readable serif titles and concept-specific illustrations. Open Graph and Twitter metadata carry absolute image URLs and descriptions.
- Kept the article prose in static HTML. Mermaid source and explanatory animation fallback text remain available before JavaScript. Three.js remains isolated to the résumé. Removed its bloom postprocessing, decorative stars/grid, and canvas glow.
- Self-hosted the new Newsreader heading font as a 36 KB Latin subset with swap behavior. No external font service is required.

## Next priorities

| Priority | Finding | Recommended action | What would verify improvement |
| --- | --- | --- | --- |
| 1 | Search visibility has not been measured in this session. | Submit `/sitemap.xml` in Search Console, inspect the three article URLs, and check Google-selected canonicals and indexing exclusions. | All intended pages indexed; then compare non-branded impressions/clicks by page and query over a comparable period. A sitemap is a discovery hint, not an indexing guarantee. |
| 1 | Titles are engaging but two AI essays use broad, ambiguous phrases. | Test more descriptive search titles while preserving editorial on-page titles and URLs. Candidates: “AI Optimization and Lost Updates: A Concurrency Example” and “Why Faster Code Can’t Fix Network Latency”. Review actual query data before changing them. | CTR and relevant impressions improve without losing query relevance. Do not treat title length as a fixed character limit. |
| 1 | Only three essays cover a relatively broad set of subjects. | Develop focused supporting articles: AoS vs SoA with actual object schemas; false sharing and cache-line ownership; TLB misses, page walks, and huge pages; readiness-based I/O in Zig. Link each to the relevant existing essay and lab. | New articles answer a specific question, attract relevant queries, and bring readers into a second article. Avoid thin tag/category pages until there is enough content. |
| 2 | The résumé still starts a substantial Three.js/GSAP bundle and animation on load. | Measure on a representative mobile device. If loading or interaction is slow, load the 3D scene after an explicit “Explore the pipeline” action or when its viewport becomes visible; keep the written résumé immediately available. Consider splitting Mermaid by diagram type after measuring its contribution. | Field LCP ≤2.5 s, INP ≤200 ms, and CLS ≤0.1 at the 75th percentile. Local build success is not a Core Web Vitals score. |
| 2 | The repository still configures a legacy `UA-168019975-1` analytics property; no GA4 measurement ID is configured here. | Verify what production actually records, then configure a current analytics property if needed. Track article landing pages, internal navigation, and referrals from X. Do not create or invent an account ID. | Consistent traffic and referral data, reconciled against Search Console. |
| 2 | Strong performance claims need clear, reproducible context. | Put hardware, compiler flags, workload, methodology, benchmark code, and limitations beside the relevant measurements. Link external technical claims to primary sources. Distinguish measured values from the animations' schematic clocks. | A reader can reproduce a result and understand where it generalizes. |
| 3 | Social cards are 1200×630; article-specific image crops could be richer. | Add equivalent 16:9, 4:3, and 1:1 article images if image search/rich-result presentation becomes a priority. Keep text legible in small crops. | Rich Results Test recognizes the article metadata and image URLs remain crawlable. Structured data does not guarantee a rich result. |

## Verification

All 24 automated tests pass, including canonical article data and sitemap coverage. The production build succeeds. Generated pages contain one H1 each and their metadata in static HTML. Desktop light/dark and 375 px article layout were checked; both flowcharts render and memory-layout controls remain functional. The cloud browser exercised the Canvas fallback; WebGL output is not independently validated in this environment.

## Primary sources

- [Article structured data](https://developers.google.com/search/docs/appearance/structured-data/article): author identity, headline, images, and dates.
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap): canonical URLs, truthful modification dates, and submission.
- [Title links](https://developers.google.com/search/docs/appearance/title-link): descriptive, concise titles rather than keyword repetition.
- [Universal Analytics retirement](https://developers.google.com/analytics/devguides/collection/analyticsjs): the repository’s legacy analytics configuration should be replaced with a current property.
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals): field metrics and target thresholds.
