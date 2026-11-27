import { describe, expect, test } from "bun:test";
import { CrawlJobSchema } from "vrc-packages-network/node";
import { fetchJobOutcome } from "../src/adapters/observation_adapter.ts";

const baseJob = {
  jobId: "lane-test",
  leaseId: "c2dd6562-6fa4-4cd2-84ae-0c090ba29733",
  leaseExpiresAt: "2099-01-01T00:00:00.000Z",
  retainClasses: ["normalized_facts", "creator_prose"] as const,
  etag: null,
  lastModified: null
};

describe("7-lane Strategy drivers and PaginationController", () => {
  test("Gumroad discovery extracts product links and respects maxPaginationDepth for nextPageLead", async () => {
    const job = CrawlJobSchema.parse({
      ...baseJob,
      platform: "gumroad",
      purpose: "discovery",
      url: "https://gumroad.com/vrchat?page=1",
      origin: "https://gumroad.com",
      paginationDepth: 0,
      maxPaginationDepth: 2
    });
    const html = `<html><body>
      <a href="https://gumroad.com/l/vrchat-tail?ref=discover">Tail</a>
      <a href="https://creator.gumroad.com/l/face-tracking">Tracking</a>
      <a rel="next" href="/vrchat?page=2">Next</a>
    </body></html>`;
    const outcome = await fetchJobOutcome(job, async () => new Response(html, { headers: { "content-type": "text/html" } }));
    expect(outcome).toEqual({
      kind: "discovery",
      leads: [
        { kind: "storefront_product", url: "https://gumroad.com/l/vrchat-tail" },
        { kind: "storefront_product", url: "https://creator.gumroad.com/l/face-tracking" }
      ],
      nextPageLead: "https://gumroad.com/vrchat?page=2"
    });
  });

  test("Jinxxy discovery supports XML sitemaps and rejects DOCTYPE XXE payloads", async () => {
    const job = CrawlJobSchema.parse({
      ...baseJob,
      platform: "jinxxy",
      purpose: "discovery",
      url: "https://jinxxy.com/sitemap_products.xml",
      origin: "https://jinxxy.com"
    });
    const xml = `<urlset><url><loc>https://jinxxy.com/creator/cyber-wings</loc></url><url><loc>https://jinxxy.com/market</loc></url></urlset>`;
    const ok = await fetchJobOutcome(job, async () => new Response(xml, { headers: { "content-type": "application/xml" } }));
    expect(ok).toEqual({
      kind: "discovery",
      leads: [{ kind: "storefront_product", url: "https://jinxxy.com/creator/cyber-wings" }]
    });

    const xxe = await fetchJobOutcome(job, async () =>
      new Response(`<!DOCTYPE urlset><urlset><url><loc>https://jinxxy.com/a/b</loc></url></urlset>`, {
        headers: { "content-type": "application/xml" }
      })
    );
    expect(xxe.kind).toBe("temporary_failure");
  });

  test("itch.io discovery allows tag pages with nextPageLead and blocks /search before network", async () => {
    const tagJob = CrawlJobSchema.parse({
      ...baseJob,
      platform: "itch",
      purpose: "discovery",
      url: "https://itch.io/tools/tag-vrchat",
      origin: "https://itch.io",
      paginationDepth: 0,
      maxPaginationDepth: 1
    });
    const html = `<html><body>
      <a href="https://devone.itch.io/vrc-helper">Helper</a>
      <a href="https://itch.io/search?q=vrchat">Blocked Search</a>
      <a class="next_page" href="https://itch.io/tools/tag-vrchat?page=2">Next</a>
    </body></html>`;
    const outcome = await fetchJobOutcome(tagJob, async () => new Response(html, { headers: { "content-type": "text/html" } }));
    expect(outcome).toEqual({
      kind: "discovery",
      leads: [{ kind: "storefront_product", url: "https://devone.itch.io/vrc-helper" }],
      nextPageLead: "https://itch.io/tools/tag-vrchat?page=2"
    });

    const searchJob = CrawlJobSchema.parse({
      ...tagJob,
      url: "https://itch.io/search?q=vrchat"
    });
    const blocked = await fetchJobOutcome(searchJob, async () => {
      throw new Error("Search URL must not reach network");
    });
    expect(blocked.kind).toBe("blocked");
  });

  test("BOOTH metadata extracts JPY price, ownerKey, and binary-free links cleanly", async () => {
    const metaJob = CrawlJobSchema.parse({
      ...baseJob,
      platform: "booth",
      purpose: "metadata",
      url: "https://booth.pm/ja/items/5551234",
      origin: "https://booth.pm"
    });
    const html = `<html><head>
      <script type="application/ld+json">{
        "@type":"Product",
        "name":"【Shinano対応】Gimmick Ring",
        "url":"https://booth.pm/ja/items/5551234",
        "brand":{"name":"SilverAtelier"},
        "offers":{"price":"1,200","priceCurrency":"JPY","availability":"https://schema.org/InStock"}
      }</script>
    </head><body>
      <div class="item-description">VRChat gimmick! <a href="https://github.com/silver/ring">Source</a> <a href="https://example.org/ring.zip">Download Zip</a></div>
    </body></html>`;
    const outcome = await fetchJobOutcome(metaJob, async () => new Response(html, { headers: { "content-type": "text/html" } }));
    expect(outcome.kind).toBe("changed");
    if (outcome.kind === "changed") {
      expect(outcome.observation.price).toBe(1200);
      expect(outcome.observation.currency).toBe("JPY");
      expect(outcome.observation.availability).toBe("available");
      expect(outcome.observation.ownerKey).toBe("booth:silveratelier");
      expect(outcome.observation.outboundLinks).toContain("https://github.com/silver/ring");
      expect(outcome.observation.outboundLinks.some((u) => u.endsWith(".zip"))).toBe(false);
    }
  });
});
