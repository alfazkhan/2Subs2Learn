import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { Builder, By, until } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const browserSelection = [...args].find((arg) => arg.startsWith('--browser='))?.split('=')[1] ?? 'all';
const siteSelection = [...args].find((arg) => arg.startsWith('--site='))?.split('=')[1] ?? 'all';
const headed = args.has('--headed');
const timeoutMs = 15_000;
const adTimeoutMs = Number(process.env.E2E_AD_TIMEOUT_MS ?? 120_000);
const subtitleTimeoutMs = Number(process.env.E2E_SUBTITLE_TIMEOUT_MS ?? 120_000);
const youtubeUrl = process.env.YOUTUBE_E2E_URL ?? 'https://www.youtube.com/watch?v=4-eDoThe6qo';
const zdfUrl = 'https://www.zdf.de/play/reportagen/die-maedchen-wg-100/mwg-athen-ankommen-in-athen-061-100';
const resultsDir = path.join(root, 'test-results', 'e2e');
const servers = [];
const failures = [];

if (!['all', 'chromium', 'firefox'].includes(browserSelection)) {
  throw new Error(`Unknown browser selection: ${browserSelection}`);
}
if (!['all', 'youtube', 'zdf'].includes(siteSelection)) {
  throw new Error(`Unknown site selection: ${siteSelection}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function report(browser, step, status, detail = '') {
  console.log(`[${status}] ${browser}: ${step}${detail ? ` - ${detail}` : ''}`);
}

function startDevServer(script, port, outputDir) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', script, '--', '--port', String(port)], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: '0' },
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output += chunk;
    process.stdout.write(`[${script}] ${chunk}`);
  });
  child.stderr.on('data', (chunk) => {
    output += chunk;
    process.stderr.write(`[${script}] ${chunk}`);
  });
  servers.push(child);

  return (async () => {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) {
        throw new Error(`${script} exited before building:\n${output}`);
      }
      if (output.includes('Load ') && output.includes(outputDir)) {
        const manifestPath = path.join(root, '.output', outputDir, 'manifest.json');
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        const csp = JSON.stringify(manifest.content_security_policy ?? '');
        const actualPort = output.match(/Started dev server @ http:\/\/localhost:(\d+)/)?.[1];
        if (!actualPort || !csp.includes(`localhost:${actualPort}`)) {
          throw new Error(`${script} output is not connected to its WXT dev server on port ${actualPort ?? 'unknown'}`);
        }
        report(script, 'Development server ready', '✅', `port ${actualPort}`);
        return;
      }
      await delay(250);
    }
    throw new Error(`${script} did not finish building within 90 seconds:\n${output}`);
  })();
}

async function stopDevServers() {
  for (const child of servers) {
    if (child.exitCode !== null) continue;
    if (process.platform === 'win32' && child.pid) {
      try {
        execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
      } catch {}
    } else {
      child.kill('SIGTERM');
    }
  }
}

async function saveScreenshot(page, name) {
  await mkdir(resultsDir, { recursive: true });
  const target = path.join(resultsDir, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false }).catch(() => {});
  return target;
}

async function waitForDualSubtitles(page, selector, label, timeout = timeoutMs) {
  await page.waitForFunction((rootSelector) => {
    const rootElement = document.querySelector(rootSelector);
    const text = (element) => element
      ? [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim()
      : '';
    const source = text(rootElement?.querySelector('[data-subtitle-track="source"]'));
    const target = text(rootElement?.querySelector('[data-subtitle-track="target"]'));
    return source.length > 0 && target.length > 0;
  }, selector, { timeout });

  const texts = await page.locator(selector).evaluate((rootElement) => {
    const text = (element) => element
      ? [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim()
      : '';
    return {
      source: text(rootElement.querySelector('[data-subtitle-track="source"]')),
      target: text(rootElement.querySelector('[data-subtitle-track="target"]')),
    };
  });
  if (!texts.source || !texts.target) {
    throw new Error(`${label} overlay did not contain both subtitle tracks`);
  }
  return texts;
}

async function dismissConsentPlaywright(page, names) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      for (const name of names) {
        const roleButton = frame.getByRole('button', { name });
        if (await roleButton.isVisible().catch(() => false)) {
          await roleButton.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1_000);
          return true;
        }

        const textButton = frame.locator('button, [role="button"]').filter({ hasText: name }).first();
        if (await textButton.isVisible().catch(() => false)) {
          await textButton.click({ force: true }).catch(() => {});
          await page.waitForTimeout(1_000);
          return true;
        }
      }
    }
    await delay(250);
  }
  return false;
}

async function waitForManualConsentDismissal(page, promptText) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    let promptVisible = false;
    for (const frame of page.frames()) {
      promptVisible ||= await frame.getByText(promptText, { exact: false }).isVisible().catch(() => false);
    }
    if (!promptVisible) return;
    await delay(500);
  }
  throw new Error(`Consent prompt remained visible after 60 seconds: ${promptText}`);
}

async function installYoutubeCaptionFixturePlaywright(page) {
  await page.route('**/api/timedtext**', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('tlang') && !url.searchParams.has('lang')) {
      await route.fulfill({ status: 200, contentType: 'text/plain', body: '1' });
      return;
    }
    const isEnglish = url.searchParams.get('tlang') === 'en' || url.searchParams.get('lang') === 'en';
    const text = isEnglish ? 'E2E translated subtitle' : 'E2E source subtitle';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [{ tStartMs: 0, dDurationMs: 120_000, segs: [{ utf8: text }] }],
      }),
    });
  });
}

async function waitForYouTubeAdToFinish(page) {
  try {
    await page.waitForFunction(() => {
      const player = document.querySelector('#movie_player');
      if (!player) return false;
      const skipButton = player.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
      if (skipButton instanceof HTMLElement && skipButton.offsetParent !== null) {
        skipButton.click();
      }
      const playerApi = player;
      const isAd = player.classList.contains('ad-showing') ||
        player.classList.contains('ad-interrupting') ||
        (typeof playerApi.getVideoData === 'function' && playerApi.getVideoData()?.isAd === true);
      return !isAd;
    }, undefined, { timeout: adTimeoutMs });
    report('YouTube', 'Advertisement finished or skipped', '✅');
  } catch (error) {
    const playerState = await page.evaluate(() => {
      const player = document.querySelector('#movie_player');
      const video = document.querySelector('video');
      return {
        url: location.href,
        playerClass: player?.className ?? null,
        playerVideoData: typeof player?.getVideoData === 'function' ? player.getVideoData() : null,
        duration: video?.duration ?? null,
        currentTime: video?.currentTime ?? null,
        visibleSkipButtons: [...(player?.querySelectorAll('.ytp-ad-skip-button, .ytp-skip-ad-button') ?? [])]
          .filter((button) => button instanceof HTMLElement && button.offsetParent !== null).length,
      };
    }).catch(() => null);
    const screenshot = await saveScreenshot(page, 'youtube-ad-timeout');
    throw new Error(`${error.message}; player state: ${JSON.stringify(playerState)}; screenshot: ${screenshot}`);
  }
}

async function runYoutubePlaywright(page, browserName) {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await installYoutubeCaptionFixturePlaywright(page);
  await page.goto(youtubeUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  const consentDismissed = await dismissConsentPlaywright(page, [/accept all/i]);
  if (consentDismissed) report(browserName, 'YouTube privacy consent accepted', '✅');
  if (!consentDismissed) {
    const promptText = 'Before you continue to YouTube';
    const screenshot = await saveScreenshot(page, `${browserName}-youtube-consent`);
    if (headed) {
      report(browserName, 'YouTube consent needs manual dismissal in the visible browser', 'WAIT', screenshot);
      await waitForManualConsentDismissal(page, promptText);
    } else if (await page.getByText(promptText).isVisible().catch(() => false)) {
      throw new Error(`Could not dismiss YouTube consent; screenshot: ${screenshot}`);
    }
  }
  await waitForYouTubeAdToFinish(page);
  await page.locator('#movie_player video').waitFor({ state: 'attached', timeout: timeoutMs });
  try {
    await page.locator('[id="2subs-yt-modal-box"]').waitFor({ state: 'visible', timeout: timeoutMs });
  } catch (error) {
    const pageState = await page.evaluate(() => {
      const player = document.querySelector('#movie_player');
      const video = document.querySelector('video');
      const response = window.ytInitialPlayerResponse;
      return {
        url: location.href,
        videoId: response?.videoDetails?.videoId ?? null,
        trackCount: response?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length ?? 0,
        duration: video?.duration ?? null,
        currentTime: video?.currentTime ?? null,
        playerClass: player?.className ?? null,
        consentVisible: [...document.querySelectorAll('body *')].some((element) =>
          element.childElementCount === 0 && /before you continue/i.test(element.textContent ?? '')
        ),
      };
    }).catch(() => null);
    const screenshot = await saveScreenshot(page, `${browserName}-youtube-no-language-modal`);
    throw new Error(`${error.message}; page state: ${JSON.stringify(pageState)}; screenshot: ${screenshot}; browser errors: ${browserErrors.slice(-8).join(' | ')}`);
  }
  report(browserName, 'YouTube subtitle language prompt', '✅');

  const sourceSelect = page.locator('[id="2subs-yt-modal-box"] select').nth(0);
  const sourceOptions = await sourceSelect.locator('option').evaluateAll((options) =>
    options.map((option) => ({ value: option.value, label: option.textContent?.trim() ?? '' })),
  );
  if (sourceOptions.length === 0) {
    throw new Error('YouTube prompt opened but found no selectable manual subtitle track');
  }
  const source = sourceOptions.find((option) => option.value === 'de') ?? sourceOptions[0];
  await sourceSelect.selectOption(source.value);
  await page.locator('[id="2subs-yt-modal-box"] select').nth(1).selectOption('en');
  await page.getByRole('button', { name: 'Confirm & Play' }).click();
  report(browserName, 'YouTube language selection submitted', '✅', `${source.label} -> English; timed-text fixture enabled`);

  try {
    const texts = await waitForDualSubtitles(page, '[id="2subs-overlay-container"]', 'YouTube');
    report(browserName, 'YouTube dual subtitles visible', '✅', `${texts.source.slice(0, 55)} | ${texts.target.slice(0, 55)}`);
  } catch (error) {
    const screenshot = await saveScreenshot(page, `${browserName}-youtube-failure`);
    throw new Error(`${error.message}; screenshot: ${screenshot}; browser errors: ${browserErrors.slice(-8).join(' | ')}`);
  }
}

async function runZdfPlaywright(page, browserName) {
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });

  await page.goto(zdfUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await dismissConsentPlaywright(page, [/ablehnen/i, /alle ablehnen/i]);
  await page.locator('video').waitFor({ state: 'attached', timeout: timeoutMs });
  report(browserName, 'ZDF player loaded', '✅');

  try {
    const texts = await waitForDualSubtitles(page, '#zdf-2subs-overlay', 'ZDF', subtitleTimeoutMs);
    const nativeSubtitleStyle = await page.locator('#zdf-hide-native-subs').count();
    if (!nativeSubtitleStyle) {
      throw new Error('ZDF dual overlay appeared without the native subtitle hide style');
    }
    report(browserName, 'ZDF subtitles auto-enabled and dual overlay visible', '✅', `${texts.source.slice(0, 55)} | ${texts.target.slice(0, 55)}`);
  } catch (error) {
    const screenshot = await saveScreenshot(page, `${browserName}-zdf-failure`);
    throw new Error(`${error.message}; screenshot: ${screenshot}; browser errors: ${browserErrors.slice(-8).join(' | ')}`);
  }
}

async function runChromium() {
  const extensionDir = path.join(root, '.output', 'chrome-mv3-dev');
  const executablePath = process.env.BRAVE_PATH ?? 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe';
  const profileDir = await mkdtemp(path.join(tmpdir(), '2subs-brave-e2e-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: !headed,
      viewport: { width: 1440, height: 1000 },
      args: [
        `--disable-extensions-except=${extensionDir}`,
        `--load-extension=${extensionDir}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    const serviceWorker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: timeoutMs });
    const workerUrl = new URL(serviceWorker.url());
    const extensionUrl = `${workerUrl.protocol}//${workerUrl.host}`;
    const popup = await context.newPage();
    await popup.goto(`${extensionUrl}/popup.html`);
    await popup.getByRole('heading', { name: 'Settings' }).waitFor({ timeout: timeoutMs });
    report('Brave', 'Extension installed and popup opened', '✅');
    await popup.close();

    const page = await context.newPage();
    if (siteSelection === 'all' || siteSelection === 'youtube') {
      await runOne('Brave YouTube', () => runYoutubePlaywright(page, 'Brave'));
    }
    if (siteSelection === 'all' || siteSelection === 'zdf') {
      await runOne('Brave ZDF', () => runZdfPlaywright(page, 'Brave'));
    }
  } finally {
    await context?.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

async function getFirefoxExtensionUrl(driver, addonId) {
  await driver.setContext(firefox.Context.CHROME);
  const rawUuids = await driver.executeScript(`
    const services = globalThis.Services ?? ChromeUtils.importESModule('resource://gre/modules/Services.sys.mjs').Services;
    return services.prefs.getCharPref('extensions.webextensions.uuids', '{}');
  `);
  await driver.setContext(firefox.Context.CONTENT);
  const uuids = JSON.parse(rawUuids);
  const uuid = uuids[addonId];
  if (!uuid) throw new Error(`Firefox did not expose a moz-extension origin for ${addonId}`);
  return `moz-extension://${uuid}`;
}

async function seleniumWaitFor(driver, script, label, timeout = timeoutMs) {
  await driver.wait(async () => Boolean(await driver.executeScript(script)), timeout, label);
}

async function dismissConsentFirefox(driver, labels) {
  const matchesLabel = (text) => labels.some((label) => label.test(text));
  const findAndClickButton = async () => {
    const buttons = await driver.findElements(By.css('button, [role="button"]'));
    for (const button of buttons) {
      if (matchesLabel(await button.getText().catch(() => ''))) {
        await button.click();
        return true;
      }
    }
    return false;
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await findAndClickButton()) {
      await delay(1_000);
      return;
    }
    await delay(300);
  }
  const frames = await driver.findElements(By.css('iframe'));
  for (const frame of frames) {
    await driver.switchTo().frame(frame);
    const clicked = await findAndClickButton();
    await driver.switchTo().defaultContent();
    if (clicked) {
      await delay(1_000);
      return;
    }
  }
}

async function installYoutubeCaptionFixtureFirefox(driver) {
  await driver.executeScript(`
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const requestUrl = typeof input === 'string' ? input : input.url;
      if (requestUrl.includes('/api/timedtext')) {
        const url = new URL(requestUrl, window.location.href);
        if (url.searchParams.has('tlang') && !url.searchParams.has('lang')) {
          return new Response('1', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        }
        const isEnglish = url.searchParams.get('tlang') === 'en' || url.searchParams.get('lang') === 'en';
        const text = isEnglish ? 'E2E translated subtitle' : 'E2E source subtitle';
        return new Response(JSON.stringify({
          events: [{ tStartMs: 0, dDurationMs: 120000, segs: [{ utf8: text }] }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  `);
}

async function runFirefoxYoutube(driver) {
  await driver.get(youtubeUrl);
  await dismissConsentFirefox(driver, [/accept all/i]);
  await seleniumWaitFor(driver, `
    const player = document.querySelector('#movie_player');
    if (!player) return false;
    const skipButton = player.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button');
    if (skipButton instanceof HTMLElement && skipButton.offsetParent !== null) skipButton.click();
    const playerApi = player;
    return !player.classList.contains('ad-showing') && !player.classList.contains('ad-interrupting') &&
      !(typeof playerApi.getVideoData === 'function' && playerApi.getVideoData()?.isAd === true);
  `, 'YouTube advertisement to finish or become skippable', adTimeoutMs);
  await seleniumWaitFor(driver, `return Boolean(document.querySelector('#movie_player video'))`, 'YouTube video player');
  await driver.wait(until.elementLocated(By.css('[id="2subs-yt-modal-box"]')), timeoutMs);
  report('Firefox', 'YouTube subtitle language prompt', '✅');
  const optionsData = await driver.executeScript(`
    const options = [...document.querySelectorAll('[id="2subs-yt-modal-box"] select')][0]?.options;
    return options ? Array.from(options, (option) => ({ value: option.value, label: option.textContent.trim() })) : [];
  `);
  if (!optionsData?.length) throw new Error('YouTube prompt opened without a manual subtitle track');
  const source = optionsData.find((option) => option.value === 'de') ?? optionsData[0];
  const selects = await driver.findElements(By.css('[id="2subs-yt-modal-box"] select'));
  await selects[0].sendKeys(source.value);
  await selects[1].sendKeys('en');
  await installYoutubeCaptionFixtureFirefox(driver);
  await driver.findElement(By.css('[id="2subs-yt-modal-box"] button')).click();
  report('Firefox', 'YouTube language selection submitted', '✅', `${source.label} -> English; timed-text fixture enabled`);
  await seleniumWaitFor(driver, `
    const root = document.querySelector('[id="2subs-overlay-container"]');
    return Boolean(root?.querySelector('[data-subtitle-track="source"]')?.textContent?.trim() && root?.querySelector('[data-subtitle-track="target"]')?.textContent?.trim());
  `, 'YouTube source and translated subtitle text');
  report('Firefox', 'YouTube dual subtitles visible', '✅');
}

async function runFirefoxZdf(driver) {
  await driver.get(zdfUrl);
  await dismissConsentFirefox(driver, [/ablehnen/i, /zustimmen/i]);
  await seleniumWaitFor(driver, `return Boolean(document.querySelector('video'))`, 'ZDF player');
  report('Firefox', 'ZDF player loaded', '✅');
  await seleniumWaitFor(driver, `
    const root = document.querySelector('#zdf-2subs-overlay');
    return Boolean(document.querySelector('#zdf-hide-native-subs') && root?.querySelector('[data-subtitle-track="source"]')?.textContent?.trim() && root?.querySelector('[data-subtitle-track="target"]')?.textContent?.trim());
  `, 'ZDF auto-enabled subtitles and dual overlay', subtitleTimeoutMs);
  report('Firefox', 'ZDF subtitles auto-enabled and dual overlay visible', '✅');
}

async function runFirefox() {
  const extensionDir = path.join(root, '.output', 'firefox-mv3-dev');
  const firefoxBinary = process.env.FIREFOX_PATH ?? 'D:\\Program Files\\Mozilla Firefox\\firefox.exe';
  process.env.MOZ_REMOTE_ALLOW_SYSTEM_ACCESS = '1';
  const options = new firefox.Options().setBinary(firefoxBinary);
  if (!headed) options.addArguments('-headless');
  const driver = await new Builder().forBrowser('firefox').setFirefoxOptions(options).build();
  await driver.manage().setTimeouts({ pageLoad: timeoutMs, script: timeoutMs, implicit: 0 });
  try {
    const addon = await driver.installWebExtension(extensionDir, { permanent: false });
    const extensionUrl = await getFirefoxExtensionUrl(driver, addon.id);
    await driver.get(`${extensionUrl}/popup.html`);
    await driver.wait(until.elementLocated(By.css('h1')), timeoutMs);
    const popupHeading = await driver.findElement(By.css('h1')).getText();
    if (popupHeading !== 'Settings') throw new Error(`Unexpected Firefox popup heading: ${popupHeading}`);
    report('Firefox', 'Extension installed and popup opened', '✅');

    if (siteSelection === 'all' || siteSelection === 'youtube') {
      await runOne('Firefox YouTube', () => runFirefoxYoutube(driver));
    }
    if (siteSelection === 'all' || siteSelection === 'zdf') {
      await runOne('Firefox ZDF', () => runFirefoxZdf(driver));
    }
  } catch (error) {
    await mkdir(resultsDir, { recursive: true });
    const screenshot = path.join(resultsDir, 'firefox-failure.png');
    await driver.takeScreenshot().then((image) => writeFile(screenshot, image, 'base64')).catch(() => {});
    throw new Error(`${error.message}; screenshot: ${screenshot}`);
  } finally {
    await driver.quit().catch(() => {});
  }
}

async function runOne(name, test) {
  try {
    await test();
  } catch (error) {
    failures.push({ name, error });
    report(name, 'E2E flow', 'FAIL', error.message);
  }
}

try {
  const targets = browserSelection === 'all' ? ['chromium', 'firefox'] : [browserSelection];
  const startTasks = [];
  if (targets.includes('chromium')) startTasks.push(startDevServer('dev', 3101, 'chrome-mv3-dev'));
  if (targets.includes('firefox')) startTasks.push(startDevServer('dev:firefox', 3102, 'firefox-mv3-dev'));
  await Promise.all(startTasks);

  if (targets.includes('chromium')) await runOne('Brave', runChromium);
  if (targets.includes('firefox')) await runOne('Firefox', runFirefox);
} finally {
  await stopDevServers();
}

if (failures.length) {
  console.error(`\n${failures.length} browser flow(s) failed.`);
  process.exitCode = 1;
} else {
  console.log('\nAll selected browser E2E flows ✅ed.');
}