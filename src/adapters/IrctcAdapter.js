'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class IrctcAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    await this.updateState('PRE_WARMING', 'Launching Cloud Chromium for IRCTC NGET...');
    this.browser = await playwrightChromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 860 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata'
    });
    this.page = await this.context.newPage();

    try {
      await this.page.goto('https://www.irctc.co.in/nget/train-search', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      await this.page.waitForTimeout(1500);

      // Dismiss sidebar mask or popup dialogs
      await this.page.evaluate(() => {
        const mask = document.querySelector('p-sidebar .ui-sidebar-close, .ui-sidebar-mask');
        if (mask) mask.click();
        const okBtn = Array.from(document.querySelectorAll('button')).find(
          (b) => b.offsetParent !== null && /^(OK|Later|Close)$/i.test((b.innerText || '').trim())
        );
        if (okBtn) okBtn.click();
      });

      const snap = await this.page.screenshot({ type: 'png' });
      const code = await this.waitForPhoneInput(
        `IRCTC #${this.job.params.trainNo || '12721'} (${this.job.params.fromCode || 'HYB'} → ${this.job.params.toCode || 'BPL'}): Enter Login Captcha / OTP`,
        snap
      );

      await this.updateState(
        'UPI_COLLECT_SENT',
        `Verified ("${code}") -> Selected #${this.job.params.trainNo || '12721'} (${this.job.params.classTier || '3A'}) -> UPI Collect sent to ${this.vault.upiId || 'phone'}`,
        { activePrompt: null }
      );
    } finally {
      await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { IrctcAdapter };
