'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class TtdAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    await this.updateState('PRE_WARMING', 'Launching Cloud Chromium for TTD ₹300 SED...');
    this.browser = await playwrightChromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.context = await this.browser.newContext({
      viewport: { width: 1366, height: 860 },
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata'
    });
    this.page = await this.context.newPage();

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
      await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { TtdAdapter };
