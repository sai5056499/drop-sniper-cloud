'use strict';

const { CloudStore } = require('./cloudStore');
const { NtpClock } = require('./ntpClock');

(async () => {
  const store = new CloudStore();
  const clock = new NtpClock();
  await clock.syncOffset();

  const jobId = process.env.JOB_ID || 'scheduled-cron';
  const site = process.env.SITE || 'irctc';
  process.stdout.write(`logName=cloudWorkerStarted, jobId=${jobId}, site=${site}, ist=${clock.istString()}\n`);

  await store.setEncrypted('drop_sniper:live_state', {
    workerState: 'CLOUD_WORKER_ACTIVE',
    site: site.toUpperCase(),
    detail: `GitHub Actions Playwright Worker executing ${site.toUpperCase()} drop (${jobId})`,
    updatedAt: new Date().toISOString()
  });
})();
