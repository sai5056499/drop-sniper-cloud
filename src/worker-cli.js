'use strict';

const { CloudStore } = require('./cloudStore');
const { NtpClock } = require('./ntpClock');
const { IrctcAdapter } = require('./adapters/IrctcAdapter');
const { TtdAdapter } = require('./adapters/TtdAdapter');
const { QueueEventAdapter } = require('./adapters/QueueEventAdapter');

(async () => {
  const store = new CloudStore();
  const ntpClock = new NtpClock();
  await ntpClock.syncOffset();

  const jobId = process.env.JOB_ID || '';
  const site = (process.env.SITE || 'irctc').toLowerCase();
  const vault = (await store.getDecrypted('drop_sniper:vault', {})) || {};
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const job = jobs.find((j) => j.id === jobId) || {
    id: jobId || `cron_${Date.now()}`,
    site,
    params: {}
  };

  let playwrightChromium = null;
  try {
    playwrightChromium = require('playwright').chromium;
  } catch {
    process.stdout.write('Playwright not installed in this environment; updating cloud state only.\n');
    await store.setEncrypted('drop_sniper:live_state', {
      workerState: 'WAITING_OTP_OR_CAPTCHA',
      site: site.toUpperCase(),
      detail: `Cloud Worker active for ${site.toUpperCase()} (${job.id})`,
      updatedAt: new Date().toISOString()
    });
    return;
  }

  const AdapterMap = {
    irctc: IrctcAdapter,
    ttd: TtdAdapter,
    ipl: QueueEventAdapter,
    bookmyshow: QueueEventAdapter
  };
  const AdapterClass = AdapterMap[site] || IrctcAdapter;
  const adapter = new AdapterClass({ job, vault, store, ntpClock });
  await adapter.execute(playwrightChromium);
})();
