import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type Rect = { x: number; y: number; width: number; height: number; right: number; bottom: number };

type LayoutMetrics = {
  viewport: { width: number; height: number };
  cards: Array<{ title: string; rect: Rect; scrollHeight: number; clientHeight: number; overflowY: string }>;
  overlapPairs: string[];
  focusRect: Rect;
  focusCoverageRatio: number;
  diagramHeight: number;
};

function intersectArea(a: Rect, b: Rect): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
  return width * height;
}

test("safety editor layout remains usable", async ({ page }, testInfo) => {
  await page.goto("/?autoplay=0&expanded=1&safetyEditor=1&visualTest=1", { waitUntil: "domcontentloaded" });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.waitForTimeout(1200);

  const metrics = await page.locator(".safety-workbench").evaluate((): LayoutMetrics => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>(".safety-top-hero, .safety-rail, .safety-help-line")).map((card) => {
      const rect = card.getBoundingClientRect();
      const title = card.querySelector("h3")?.textContent?.trim() ?? card.className.split(" ")[0] ?? "untitled";
      const style = window.getComputedStyle(card);
      return {
        title,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.right,
          bottom: rect.bottom
        },
        scrollHeight: card.scrollHeight,
        clientHeight: card.clientHeight,
        overflowY: style.overflowY
      };
    });

    const overlapPairs: string[] = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i];
        const b = cards[j];
        const width = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.x, b.rect.x));
        const height = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.y, b.rect.y));
        if (width * height > 4) {
          overlapPairs.push(`${a.title} <> ${b.title}`);
        }
      }
    }

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const focusRect = {
      x: viewport.width * 0.34,
      y: viewport.height * 0.38,
      width: viewport.width * 0.32,
      height: viewport.height * 0.34,
      right: viewport.width * 0.66,
      bottom: viewport.height * 0.72
    };
    const focusArea = focusRect.width * focusRect.height;
    const coveredArea = cards.reduce((sum, card) => {
      const width = Math.max(0, Math.min(card.rect.right, focusRect.right) - Math.max(card.rect.x, focusRect.x));
      const height = Math.max(0, Math.min(card.rect.bottom, focusRect.bottom) - Math.max(card.rect.y, focusRect.y));
      return sum + width * height;
    }, 0);

    const diagramHeight =
      document
        .querySelector<HTMLElement>(".beam-diagram-button, .safety-hero-diagram")
        ?.getBoundingClientRect().height ?? 0;

    return {
      viewport,
      cards,
      overlapPairs,
      focusRect,
      focusCoverageRatio: coveredArea / focusArea,
      diagramHeight
    };
  });

  const screenshotPath = path.join(testInfo.outputDir, "safety-editor-layout.png");
  await page.screenshot({ path: screenshotPath, fullPage: false });
  await fs.mkdir("test-results", { recursive: true });
  await fs.copyFile(screenshotPath, "test-results/safety-editor-layout.png");

  const scrollableCards = metrics.cards.filter((card) => card.scrollHeight > card.clientHeight + 4);

  await expect(page.getByText("Farmer status").last()).toBeVisible();
  await page.getByRole("button", { name: "Show math" }).click();
  await expect(page.locator(".formula-block")).toBeVisible();
  for (const card of scrollableCards) {
    expect(["auto", "scroll"]).toContain(card.overflowY);
  }

  expect(metrics.overlapPairs, JSON.stringify(metrics, null, 2)).toEqual([]);
  expect(metrics.focusCoverageRatio, JSON.stringify(metrics, null, 2)).toBeLessThan(0.08);
  expect(metrics.diagramHeight, JSON.stringify(metrics, null, 2)).toBeLessThan(320);
});
