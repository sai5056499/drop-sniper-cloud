'use strict';

class NtpClock {
  constructor() {
    this.offsetMs = 0;
  }

  async syncOffset() {
    const start = Date.now();
    try {
      const res = await fetch('https://www.google.com', { method: 'HEAD' });
      const end = Date.now();
      const serverDateHeader = res.headers.get('date');
      if (serverDateHeader) {
        const rtt = end - start;
        const serverEpoch = new Date(serverDateHeader).getTime() + Math.round(rtt / 2);
        this.offsetMs = serverEpoch - end;
      }
    } catch {
      this.offsetMs = 0;
    }
    return this.offsetMs;
  }

  nowMs() {
    return Date.now() + this.offsetMs;
  }

  istString() {
    return new Date(this.nowMs()).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  }
}

module.exports = { NtpClock };
