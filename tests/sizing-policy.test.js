import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexCss = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function remPixels(multiplier, rootFontSize) {
  return multiplier * rootFontSize;
}

describe("global rem sizing policy", () => {
  it("keeps rem rooted in the browser/user base size and normalizes text autosizing", () => {
    const rootPolicy = indexCss.match(/html\s*\{([^}]*)\}/)?.[1];

    expect(rootPolicy).toBeTruthy();
    expect(rootPolicy).toMatch(/font-size:\s*100%;/);
    expect(rootPolicy).toMatch(/-webkit-text-size-adjust:\s*100%;/);
    expect(rootPolicy).toMatch(/text-size-adjust:\s*100%;/);
    expect(rootPolicy).not.toMatch(/font-size:\s*(?:16px|62\.5%);/);
  });

  it("keeps the typography tokens proportional to an arbitrary computed root size", () => {
    expect(indexCss).toMatch(/--font-size-xs:\s*0\.75rem;/);
    expect(indexCss).toMatch(/--font-size-md:\s*1rem;/);
    expect(indexCss).toMatch(/--font-size-2xl:\s*1\.5rem;/);
    expect(indexCss).toMatch(/--font-size-3xl:\s*2rem;/);
    expect(indexCss).toMatch(/--font-size-4xl:\s*3rem;/);
    expect(indexCss).toMatch(/--font-size-display:\s*4\.25rem;/);

    const rootFontSize = 19;
    expect(remPixels(1, rootFontSize)).toBe(rootFontSize);
    expect(remPixels(1.5, rootFontSize)).toBe(28.5);
    expect(remPixels(4.25, rootFontSize)).toBe(80.75);
  });

  it("preserves intentional responsive typography without changing the root size", () => {
    expect(appCss).toMatch(/@container landing \(width < 48rem\)[\s\S]*?\.hero-copy h1\s*\{\s*font-size:\s*var\(--font-size-3xl\);/);
    expect(appCss).toMatch(/\.hero-copy\s*\{[\s\S]*?& h1\s*\{[\s\S]*?font-size:\s*var\(--font-size-display\);/);
    expect(appCss).toMatch(/@media \(min-width: 52\.001rem\)[\s\S]*?:root\s*\{[\s\S]*?--header-title-size:\s*3rem;/);
    expect(appCss).toMatch(/@media \(max-width: 52rem\)/);
    const rootBlocks = appCss.match(/:root\s*\{[^}]*\}/g) || [];
    expect(rootBlocks).not.toHaveLength(0);
    expect(rootBlocks.join("\n")).not.toMatch(/font-size\s*:/);
  });

  it("keeps the mobile viewport accessible and unconstrained", () => {
    expect(indexHtml).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1\.0"\s*\/>/);
    expect(indexHtml).not.toMatch(/(?:maximum-scale|user-scalable)/i);
  });
});
