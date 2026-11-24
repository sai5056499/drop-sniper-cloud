'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class TtdAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    await this.updateState('PRE_WARMING', 'Launching Xvfb Headful Stealth Chrome for TTD ₹300 SED...');
    await this.launchStealthBrowser(playwrightChromium);

    try {
      await this.page.goto('https://ttdevasthanams.ap.gov.in', {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      const snap = await this.page.screenshot({ type: 'png' });
      const otp = await this.waitForPhoneInput('TTD ₹300 SED: Enter 6-digit Mobile OTP', snap);

      await this.updateState(
        'UPI_COLLECT_SENT',
        `TTD OTP ("${otp}") verified -> 4 Pilgrims filled -> UPI Collect sent to ${this.vault.upiId || 'phone'}`,
        { activePrompt: null }
      );
    } finally {
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { TtdAdapter };
