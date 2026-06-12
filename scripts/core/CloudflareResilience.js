'use strict';

const playwright = require('playwright');
const { sleep } = require('./utils');

class CloudflareResilience {
  constructor() {
    this.browser = null;
    this.contextPool = [];
    this.MAX_CONTEXTS = 5;
    this.requestDelayMs = 500;
    this.userAgents = [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
    ];
    this.contextInUse = new Set();
  }

  async init() {
    if (!this.browser) {
      this.browser = await playwright.chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-http2',
          '--disable-blink-features=AutomationControlled',
        ],
      });
    }
  }

  _pickUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async getContext() {
    await this.init();
    await sleep(this.requestDelayMs + Math.random() * 300);

    for (const ctx of this.contextPool) {
      if (!this.contextInUse.has(ctx)) {
        this.contextInUse.add(ctx);
        return ctx;
      }
    }

    if (this.contextPool.length >= this.MAX_CONTEXTS) {
      const ctx = this.contextPool[0];
      this.contextInUse.add(ctx);
      return ctx;
    }

    const ua = this._pickUserAgent();
    const viewport = {
      width: 1280 + Math.floor(Math.random() * 100),
      height: 800 + Math.floor(Math.random() * 50),
    };

    const context = await this.browser.newContext({
      userAgent: ua,
      viewport,
      locale: 'en-US',
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
      },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    });

    this.contextPool.push(context);
    this.contextInUse.add(context);
    return context;
  }

  releaseContext(context) {
    this.contextInUse.delete(context);
  }

  increasePacing() {
    this.requestDelayMs = Math.min(3000, this.requestDelayMs + 200);
  }

  decreasePacing() {
    this.requestDelayMs = Math.max(300, this.requestDelayMs - 100);
  }

  async closeAll() {
    for (const ctx of this.contextPool) {
      try { await ctx.close(); } catch { /* ignore */ }
    }
    this.contextPool = [];
    this.contextInUse.clear();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new CloudflareResilience();
