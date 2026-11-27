import { describe, expect, test } from "bun:test";
import { fetchJobOutcome } from "../src/adapters/observation_adapter.ts";
import { CrawlJobSchema } from "vrc-packages-network/node";

const sitemapUrl = "https://merchant.example/sitemap_products_1.xml?from=1&to=100";
const productUrl = "https://merchant.example/products/vrchat-tool";
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${productUrl}</loc></url>
  <url><loc>${productUrl}</loc></url>
  <url><loc>https://unrelated.example/products/copied-title</loc></url>
  <url><loc>https://merchant.example/collections/avatars</loc></url>
</urlset>`;

describe("node-owned Shopify product sitemap parsing", () => {
  test("requires a product-sitemap discovery lease before any fetch and bounds leads", async () => {
    const job = CrawlJobSchema.parse({ jobId: "shopify-test", leaseId: crypto.randomUUID(),
      platform: "shopify", purpose: "discovery", url: sitemapUrl, origin: "https://merchant.example",
      leaseExpiresAt: "2099-01-01T00:00:00.000Z", retainClasses: ["normalized_facts"],
      etag: null, lastModified: null });
    let accept = "";
    expect(await fetchJobOutcome(job, async (_input, init) => {
      accept = new Headers(init?.headers).get("accept") || "";
      return new Response(xml, { headers: { "content-type": "application/xml" } });
    })).toEqual({ kind: "discovery", leads: [
      { kind: "storefront_product", url: productUrl }
    ] });
    expect(accept).toContain("application/xml");
    for (const invalid of [{ ...job, purpose: "metadata" as const },
      { ...job, url: "https://merchant.example/sitemap.xml" }]) {
      expect((await fetchJobOutcome(invalid, async () => {
        throw new Error("Invalid Shopify job reached network");
      })).kind).toBe("blocked");
    }
    const many = `<urlset>${Array.from({ length: 101 }, (_, index) =>
      `<url><loc>https://merchant.example/products/item-${index}</loc></url>`).join("")}</urlset>`;
    const capped = await fetchJobOutcome(job, async () => new Response(many,
      { headers: { "content-type": "application/xml" } }));
    expect(capped.kind).toBe("discovery");
    if (capped.kind === "discovery") {
      expect(capped.leads).toHaveLength(100);
      expect(capped.nextPageLead).toBeUndefined();
    }
    for (const bad of ["<sitemapindex><sitemap><loc>https://merchant.example/sitemap_products_2.xml</loc></sitemap></sitemapindex>",
      `<!DOCTYPE urlset [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><urlset><url><loc>${productUrl}</loc></url></urlset>`,
      `<urlset><url><loc>${productUrl}</loc></url>`]) {
      expect((await fetchJobOutcome(job, async () => new Response(bad,
        { headers: { "content-type": "application/xml" } }))).kind).toBe("temporary_failure");
    }
    expect((await fetchJobOutcome(job, async () => new Response(xml,
      { headers: { "content-type": "text/html" } }))).kind).toBe("temporary_failure");

    let metadataAccept = "";
    const metaJob = { ...job, purpose: "metadata" as const, url: productUrl };
    const metaOutcome = await fetchJobOutcome(metaJob, async (_input, init) => {
      metadataAccept = new Headers(init?.headers).get("accept") || "";
      return new Response(
        `<html><head><script type="application/ld+json">{"@type":"Product","name":"VRChat Tool"}</script></head></html>`,
        { headers: { "content-type": "text/html" } }
      );
    });
    expect(metadataAccept).toContain("text/html");
    expect(metaOutcome.kind).toBe("changed");
  });

});
