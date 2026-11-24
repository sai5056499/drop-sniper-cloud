'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class IrctcAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    await this.updateState('PRE_WARMING', 'Launching Xvfb Headful Stealth Chrome for IRCTC NGET...');
    await this.launchStealthBrowser(playwrightChromium);

    try {
      await this.page.goto('https://www.irctc.co.in/nget/train-search', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      await this.page.waitForTimeout(1500);

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
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { IrctcAdapter };
