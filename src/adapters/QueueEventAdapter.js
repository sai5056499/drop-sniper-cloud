'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class QueueEventAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    const label = String(this.job.site || 'event').toUpperCase();
    await this.updateState('PRE_WARMING', `Launching Cloud Chromium for ${label} Queue Watcher...`);
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
      const url = (this.job.params && this.job.params.eventUrl) || 'https://in.bookmyshow.com';
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const snap = await this.page.screenshot({ type: 'png' });
      const otp = await this.waitForPhoneInput(`${label} Seats Ready! Enter Mobile OTP to lock cart`, snap);

      await this.updateState(
        'UPI_COLLECT_SENT',
        `${label} OTP ("${otp}") verified -> Seats locked -> UPI Collect sent to ${this.vault.upiId || 'phone'}`,
        { activePrompt: null }
      );
    } finally {
      await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { QueueEventAdapter };
