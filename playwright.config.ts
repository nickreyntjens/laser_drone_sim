import { defineConfig } from "@playwright/test";

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  expect: {
    timeout: 10000
  },
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
    viewport: {
      width: 1440,
      height: 1080
    },
    launchOptions: {
      executablePath: chromePath
    }
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30000
  }
});
