import { describe, it, expect } from "bun:test";
import { cleanTitle, unescapeHtml, cleanTrackingParams } from "vrc-packages-network/catalog-hygiene";
import { htmlSanitizer } from "../src/pipeline/html_sanitizer.ts";

describe("Front-stage sanitization and normalization", () => {
  it("unescapes HTML entities correctly", () => {
    expect(unescapeHtml("&amp; &lt; &gt; &quot; &#39; &#x2F;")).toBe("& < > \" ' /");
  });

  it("normalizes Japanese BOOTH decorative marketing brackets and CJK characters", () => {
    const rawTitle = "【VRChat想定】［無料］Modular Avatar対応 ツール【MA対応】";
    const cleaned = cleanTitle(rawTitle);
    expect(cleaned).toContain("Modular Avatar対応 ツール");
    expect(cleaned).not.toContain("【VRChat想定】");
    expect(cleaned).not.toContain("［無料］");
    expect(cleaned).not.toContain("【MA対応】");
  });

  it("normalizes Western marketing brackets and version numbers", () => {
    const rawTitle = "[FREE] [VRChat] Advanced Locomotion System v2.1.0 beta";
    const cleaned = cleanTitle(rawTitle);
    expect(cleaned).toBe("Advanced Locomotion System");
  });

  it("cleans author names by stripping HTML tags, parentheticals, and twitter handles", () => {
    expect(htmlSanitizer.sanitizeAuthor("<b>CreatorName</b> (@TwitterHandle)")).toBe("CreatorName");
    expect(htmlSanitizer.sanitizeAuthor("Author &amp; Co.")).toBe("Author & Co.");
    expect(htmlSanitizer.sanitizeAuthor("@SoloDev")).toBe("SoloDev");
    expect(htmlSanitizer.sanitizeAuthor("Creator @handle")).toBe("Creator");
    expect(htmlSanitizer.sanitizeAuthor("")).toBe("Unknown");
  });

  it("sanitizeText strips discord invites, image markdown, and normalizes spacing while preserving paragraphs", () => {
    const rawDesc = "A great VRChat utility!<br>Join our server: https://discord.gg/abc1234 &amp; enjoy!\nOr https://discord.com/invite/xyz\n\n![Screenshot](https://example.com/pic.png)\n\nFeature list here.";
    const cleaned = htmlSanitizer.sanitizeText(rawDesc);
    expect(cleaned).not.toContain("https://discord.gg/");
    expect(cleaned).not.toContain("https://discord.com/invite/");
    expect(cleaned).not.toContain("![Screenshot]");
    expect(cleaned).toContain("& enjoy!");
    expect(cleaned).toContain("A great VRChat utility!");
    expect(cleaned).toContain("\n\nFeature list here.");
  });

  it("cleanTrackingParams strips tracking parameters, analytics IDs, and affiliate tokens (LEGAL.md Section 4.3)", () => {
    const url = "https://example.com/items/12345?utm_source=twitter&utm_medium=social&aff=xyz&ref=affiliate&fbclid=abc&session_id=s123&keep=true";
    const cleaned = cleanTrackingParams(url);
    expect(cleaned).toBe("https://example.com/items/12345?keep=true");

    const cleanPlain = cleanTrackingParams("https://example.com/item/42");
    expect(cleanPlain).toBe("https://example.com/item/42");

    const cleanRoot = cleanTrackingParams("https://example.com?utm_source=twitter");
    expect(cleanRoot).toBe("https://example.com");

    const nonUrl = cleanTrackingParams("not-a-url");
    expect(nonUrl).toBe("not-a-url");
  });
});
