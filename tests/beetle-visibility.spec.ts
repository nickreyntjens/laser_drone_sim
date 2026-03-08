import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

type VisibleBeetle = {
  id: number;
  screenX: number;
  screenY: number;
  settleProgress: number;
  opacityFactor: number;
  visible: boolean;
};

type PhotonicTestState = {
  canvasWidth: number;
  canvasHeight: number;
  introProgress: number;
  isIntroActive: boolean;
  cameraMode: string;
  visibleBeetles: VisibleBeetle[];
};

declare global {
  interface Window {
    __PHOTONIC_TEST_STATE__?: PhotonicTestState;
  }
}

type BeetlePixelProbe = {
  size: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

test("intro overview shows multiple beetles in the rendered frame at once", async ({
  page
}, testInfo) => {
  await page.goto("/?autoplay=0&visualTest=1&camera=overview");

  await page.waitForFunction(() => {
    const state = window.__PHOTONIC_TEST_STATE__;
    return (
      !!state &&
      state.isIntroActive &&
      state.cameraMode === "overview" &&
      state.visibleBeetles.length >= 2
    );
  });

  const scene = page.locator(".scene-shell canvas");
  const screenshotPath = path.join(testInfo.outputDir, "beetle-visibility.png");
  const screenshot = await scene.screenshot({ path: screenshotPath });
  await testInfo.attach("beetle-visibility", {
    body: screenshot,
    contentType: "image/png"
  });
  await fs.mkdir("test-results", { recursive: true });
  await fs.copyFile(screenshotPath, "test-results/beetle-visibility.png");

  const state = await page.evaluate(() => window.__PHOTONIC_TEST_STATE__ as PhotonicTestState);
  await testInfo.attach("beetle-visibility-state", {
    body: JSON.stringify(state, null, 2),
    contentType: "application/json"
  });
  const probes = await page.evaluate(
    async ({ pngBase64 }: { pngBase64: string }) => {
      const response = await fetch(`data:image/png;base64,${pngBase64}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Missing 2D context for screenshot probe");
      }

      context.drawImage(bitmap, 0, 0);

      const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const isWarmMarkerPixel = (x: number, y: number): boolean => {
        const index = (y * canvas.width + x) * 4;
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];

        return alpha > 0 && red >= 135 && green >= 95 && blue <= 125 && red >= blue + 18;
      };

      const visited = new Uint8Array(canvas.width * canvas.height);
      const components: BeetlePixelProbe[] = [];

      for (let startY = 0; startY < canvas.height; startY += 1) {
        for (let startX = 0; startX < canvas.width; startX += 1) {
          const startIndex = startY * canvas.width + startX;
          if (visited[startIndex] || !isWarmMarkerPixel(startX, startY)) {
            continue;
          }

          const stack: Array<[number, number]> = [[startX, startY]];
          visited[startIndex] = 1;
          let size = 0;
          let minX = startX;
          let minY = startY;
          let maxX = startX;
          let maxY = startY;

          while (stack.length > 0) {
            const [x, y] = stack.pop() as [number, number];
            size += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);

            const neighbors: Array<[number, number]> = [
              [x + 1, y],
              [x - 1, y],
              [x, y + 1],
              [x, y - 1]
            ];

            for (const [nextX, nextY] of neighbors) {
              if (nextX < 0 || nextX >= canvas.width || nextY < 0 || nextY >= canvas.height) {
                continue;
              }
              const nextIndex = nextY * canvas.width + nextX;
              if (visited[nextIndex] || !isWarmMarkerPixel(nextX, nextY)) {
                continue;
              }

              visited[nextIndex] = 1;
              stack.push([nextX, nextY]);
            }
          }

          const width = maxX - minX + 1;
          const height = maxY - minY + 1;
          if (size >= 10 && width <= 28 && height <= 28) {
            components.push({
              size,
              minX,
              minY,
              maxX,
              maxY
            });
          }
        }
      }

      components.sort((a, b) => b.size - a.size);
      return components.slice(0, 24);
    },
    {
      pngBase64: screenshot.toString("base64")
    }
  );
  await testInfo.attach("beetle-pixel-probes", {
    body: JSON.stringify(probes, null, 2),
    contentType: "application/json"
  });

  expect(state.isIntroActive).toBe(true);
  expect(state.cameraMode).toBe("overview");
  expect(state.visibleBeetles.length).toBeGreaterThanOrEqual(2);
  expect(
    state.visibleBeetles.every(
      (beetle) =>
        beetle.visible &&
        beetle.opacityFactor >= 0.6 &&
        beetle.screenX >= 0 &&
        beetle.screenX <= state.canvasWidth &&
        beetle.screenY >= 0 &&
        beetle.screenY <= state.canvasHeight
    )
  ).toBe(true);
  expect((probes as BeetlePixelProbe[]).length, JSON.stringify(probes, null, 2)).toBeGreaterThanOrEqual(2);
});
