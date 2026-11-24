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
