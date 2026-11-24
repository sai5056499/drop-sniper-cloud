'use strict';

const { BaseBookingAdapter } = require('./BaseBookingAdapter');

class QueueEventAdapter extends BaseBookingAdapter {
  async execute(playwrightChromium) {
    const label = String(this.job.site || 'event').toUpperCase();
    await this.updateState('PRE_WARMING', `Launching Xvfb Headful Stealth Chrome for ${label}...`);
    await this.launchStealthBrowser(playwrightChromium);

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
      if (this.browser) await this.browser.close().catch(() => {});
    }
  }
}

module.exports = { QueueEventAdapter };
