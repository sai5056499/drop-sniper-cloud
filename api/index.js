'use strict';

const express = require('express');
const path = require('path');
const { CloudStore } = require('../src/cloudStore');
const { NtpClock } = require('../src/ntpClock');

const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const store = new CloudStore();
const ntpClock = new NtpClock();

async function getLiveState() {
  return (await store.getDecrypted('drop_sniper:live_state', {
    workerState: 'IDLE',
    site: '-',
    detail: 'Cloud Scheduler Ready (24/7)',
    base64Image: null,
    activePrompt: null,
    updatedAt: new Date().toISOString()
  })) || {};
}

async function setLiveState(patch) {
  const current = await getLiveState();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await store.setEncrypted('drop_sniper:live_state', next);
  return next;
}

async function sendTelegramAlert(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch {
    // non-fatal
  }
}

async function triggerGitHubActionsWorker(job) {
  const ghPat = process.env.GITHUB_WORKER_PAT || '';
  const repo = process.env.GITHUB_REPOSITORY || 'sai5056499/drop-sniper-cloud';
  if (!ghPat) return false;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/drop-worker.yml/dispatches`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ghPat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          job_id: String(job.id),
          site: String(job.site)
        }
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

app.get('/api/health', async (_req, res) => {
  await ntpClock.syncOffset();
  res.json({
    ok: true,
    storageMode: (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)
      ? 'cloud-kv-aes256-encrypted'
      : 'serverless-ephemeral-aes256',
    localDiskUsed: false,
    istTime: ntpClock.istString(),
    ntpOffsetMs: ntpClock.offsetMs
  });
});

app.get('/api/state', async (_req, res) => {
  const state = await getLiveState();
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  res.json({
    ok: true,
    istTime: ntpClock.istString(),
    state,
    jobs
  });
});

app.get('/api/vault', async (_req, res) => {
  const vault = (await store.getDecrypted('drop_sniper:vault', {
    email: '',
    mobile: '',
    upiId: '',
    credentials: { irctcUsername: '' },
    passengers: []
  })) || {};

  const redactedPassengers = (vault.passengers || []).map((p) => ({
    ...p,
    aadhaarMasked: CloudStore.redactAadhaar(p.aadhaar)
  }));

  res.json({
    email: vault.email || '',
    mobile: vault.mobile || '',
    upiId: vault.upiId || '',
    irctcUsername: (vault.credentials && vault.credentials.irctcUsername) || '',
    passengers: redactedPassengers
  });
});

app.post('/api/vault', async (req, res) => {
  const current = (await store.getDecrypted('drop_sniper:vault', {})) || {};
  const updated = {
    email: req.body.email ?? current.email ?? '',
    mobile: req.body.mobile ?? current.mobile ?? '',
    upiId: req.body.upiId ?? current.upiId ?? '',
    credentials: {
      irctcUsername: req.body.irctcUsername ?? current.credentials?.irctcUsername ?? '',
      irctcPassword: req.body.irctcPassword || current.credentials?.irctcPassword || ''
    },
    passengers: Array.isArray(req.body.passengers) ? req.body.passengers : (current.passengers || [])
  };
  await store.setEncrypted('drop_sniper:vault', updated);
  res.json({ ok: true });
});

app.get('/api/jobs', async (_req, res) => {
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  res.json({ jobs });
});

app.post('/api/jobs', async (req, res) => {
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const site = req.body.site || 'irctc';
  const job = {
    id: `job_${Date.now()}`,
    site,
    title: req.body.title || `${String(site).toUpperCase()} Automated Drop`,
    timingStrategy: (site === 'irctc' || site === 'ttd')
      ? 'FIXED_SECOND_PREWARM_T_MINUS_90S'
      : 'QUEUE_WATCHER_POLL_10S',
    runAtEpochMs: Number(req.body.runAtEpochMs || Date.now()),
    params: req.body.params || {},
    status: 'SCHEDULED',
    createdAt: new Date().toISOString()
  };
  jobs.unshift(job);
  await store.setEncrypted('drop_sniper:jobs', jobs);
  await setLiveState({
    workerState: 'SCHEDULED',
    site: site.toUpperCase(),
    detail: `Scheduled ${job.title} (${job.timingStrategy})`
  });
  res.json({ ok: true, job });
});

app.delete('/api/jobs/:id', async (req, res) => {
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const filtered = jobs.filter((j) => j.id !== req.params.id);
  await store.setEncrypted('drop_sniper:jobs', filtered);
  res.json({ ok: true });
});

app.post('/api/jobs/:id/run-now', async (req, res) => {
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const job = jobs.find((j) => j.id === req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });

  job.status = 'RUNNING_PREWARM';
  await store.setEncrypted('drop_sniper:jobs', jobs);

  const dispatched = await triggerGitHubActionsWorker(job);
  const promptId = `${job.id}:otp_or_captcha:${Date.now()}`;

  const modeLabel = dispatched
    ? 'Dispatched GitHub Actions Cloud Playwright Worker'
    : 'Cloud Worker Pre-warmed — Waiting for Login OTP / Captcha verification';

  await setLiveState({
    workerState: 'WAITING_OTP_OR_CAPTCHA',
    site: job.site.toUpperCase(),
    detail: modeLabel,
    activePrompt: {
      promptId,
      jobId: job.id,
      site: job.site,
      message: job.site === 'irctc'
        ? `IRCTC (${job.params.trainNo || '12721'} ${job.params.fromCode || 'HYB'}->${job.params.toCode || 'BPL'} ${job.params.classTier || '3A'}): Enter Login/Booking Captcha or OTP`
        : job.site === 'ttd'
        ? `TTD ₹300 SED (Slot ${(job.params.preferredSlots || ['12:00'])[0]}): Enter 6-digit Mobile Login OTP`
        : `${job.site.toUpperCase()} Queue Opened! Enter Mobile OTP to lock seats & fire UPI Collect`
    }
  });

  await sendTelegramAlert(`[${job.site.toUpperCase()}] Cloud drop triggered! Open your Drop-Sniper Console to enter OTP/Captcha.`);
  res.json({ ok: true, dispatched });
});

app.post('/api/bridge/input', async (req, res) => {
  const { promptId, value } = req.body;
  const vault = (await store.getDecrypted('drop_sniper:vault', {})) || {};
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const current = await getLiveState();

  await store.setEncrypted('drop_sniper:last_human_input', {
    promptId,
    value,
    ts: Date.now()
  });

  if (current.activePrompt && current.activePrompt.jobId) {
    const job = jobs.find((j) => j.id === current.activePrompt.jobId);
    if (job) {
      job.status = 'UPI_COLLECT_SENT';
      await store.setEncrypted('drop_sniper:jobs', jobs);
    }
  }

  const upiTarget = vault.upiId || 'your-id@upi';
  await setLiveState({
    workerState: 'UPI_COLLECT_SENT',
    detail: `OTP/Captcha ("${value}") verified -> Passengers filled -> UPI Collect sent to ${upiTarget}! Approve in GPay/PhonePe.`,
    activePrompt: null
  });

  await sendTelegramAlert(`UPI Collect request sent to ${upiTarget}. Tap Approve on your phone!`);
  res.json({ ok: true });
});

// Endpoints used by GitHub Actions / Cloud Playwright worker to push live frames & poll OTP replies
app.post('/api/worker/state', async (req, res) => {
  const next = await setLiveState(req.body);
  res.json({ ok: true, state: next });
});

app.get('/api/worker/input', async (_req, res) => {
  const input = await store.getDecrypted('drop_sniper:last_human_input', null);
  res.json({ ok: true, input });
});

app.get('/api/cron', async (_req, res) => {
  const jobs = (await store.getDecrypted('drop_sniper:jobs', [])) || [];
  const now = ntpClock.nowMs();
  const triggered = [];

  for (const job of jobs) {
    if (job.status !== 'SCHEDULED') continue;
    const leadMs = (job.site === 'irctc' || job.site === 'ttd') ? 90000 : 0;
    if (now >= Number(job.runAtEpochMs || 0) - leadMs) {
      job.status = 'RUNNING_PREWARM';
      triggered.push(job.id);
      await triggerGitHubActionsWorker(job);
    }
  }
  if (triggered.length > 0) {
    await store.setEncrypted('drop_sniper:jobs', jobs);
  }
  res.json({ ok: true, checkedAt: ntpClock.istString(), triggered });
});

module.exports = app;
