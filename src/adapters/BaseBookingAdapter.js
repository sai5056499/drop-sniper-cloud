'use strict';

class BaseBookingAdapter {
  constructor({ job, vault, store, ntpClock }) {
    this.job = job;
    this.vault = vault;
    this.store = store;
    this.ntpClock = ntpClock;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  static parseProxy(proxyUrlStr) {
    if (!proxyUrlStr) return undefined;
    try {
      const u = new URL(proxyUrlStr);
      return {
        server: `${u.protocol}//${u.hostname}:${u.port}`,
        username: u.username ? decodeURIComponent(u.username) : undefined,
        password: u.password ? decodeURIComponent(u.password) : undefined
      };
    } catch {
      return { server: proxyUrlStr };
    }
  }

  async launchStealthBrowser(playwrightChromium) {
    const wsEndpoint = process.env.BROWSER_WS_ENDPOINT || '';
    if (wsEndpoint) {
      await this.updateState('PRE_WARMING', 'Connecting over CDP to remote stealth browser...');
      this.browser = await playwrightChromium.connectOverCDP(wsEndpoint);
      this.context = this.browser.contexts()[0] || (await this.browser.newContext());
      this.page = this.context.pages()[0] || (await this.context.newPage());
      return;
    }

    const hasDisplay = Boolean(process.env.DISPLAY);
    const proxy = BaseBookingAdapter.parseProxy(process.env.INDIAN_PROXY_URL);
    const launchOptions = {
      headless: !hasDisplay,
      proxy,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--window-size=1366,860'
      ]
    };

    try {
      this.browser = await playwrightChromium.launch({ ...launchOptions, channel: 'chrome' });
    } catch {
      this.browser = await playwrightChromium.launch(launchOptions);
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 860 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata',
      extraHTTPHeaders: {
        'Accept-Language': 'en-IN,en-US;q=0.9,en;q=0.8'
      }
    });

    // Inject anti-bot fingerprint evasion before any page script executes
    await this.context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-IN', 'en-US', 'en'] });
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
      window.chrome = window.chrome || {
        runtime: {},
        loadTimes: function () {},
        csi: function () {},
        app: { isInstalled: false }
      };
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) return 'Apple Inc.';
        if (parameter === 37446) return 'Apple M3';
        return getParameter.call(this, parameter);
      };
    });

    this.page = await this.context.newPage();
  }

  async updateState(workerState, detail, extra = {}) {
    await this.store.setEncrypted('drop_sniper:live_state', {
      workerState,
      site: String(this.job.site || '').toUpperCase(),
      detail,
      ...extra,
      updatedAt: new Date().toISOString()
    });
  }

  async waitForPhoneInput(message, screenshotBuffer = null, timeoutMs = 120000) {
    const promptId = `${this.job.id}:prompt:${Date.now()}`;
    const base64Image = screenshotBuffer
      ? `data:image/png;base64,${screenshotBuffer.toString('base64')}`
      : null;

    await this.updateState('WAITING_OTP_OR_CAPTCHA', message, {
      base64Image,
      activePrompt: {
        promptId,
        jobId: this.job.id,
        site: this.job.site,
        message
      }
    });

    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const reply = await this.store.getDecrypted('drop_sniper:last_human_input', null);
      if (reply && reply.promptId === promptId && reply.value) {
        return String(reply.value).trim();
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new Error('Timed out waiting for OTP/Captcha reply from phone');
  }
}

module.exports = { BaseBookingAdapter };
