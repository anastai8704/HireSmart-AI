// Notification email queueing, idempotency and retry, tested with mocked models and a mocked mail transport.
// No SMTP server and no database are used. Actual email delivery is a separate, credentialed check (see docs).
process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert/strict");

const JobRun = require("../models/JobRun");
const Notification = require("../models/Notification");
const emailService = require("../services/emailService");
const queue = require("../services/jobQueueService");

// Minimal in-memory stand-ins for the model statics the queue uses.
const makeStore = () => {
  const jobs = [];
  const notifications = new Map();
  const restore = [];
  const patch = (target, key, value) => {
    restore.push([target, key, target[key]]);
    target[key] = value;
  };
  const wrap = (doc) => Object.assign(doc, { save: async () => doc });
  patch(JobRun, "create", async (data) => {
    const doc = wrap({ _id: `job${jobs.length + 1}`, attempts: 0, status: "queued", nextAttemptAt: new Date(0), ...data });
    jobs.push(doc);
    return doc;
  });
  // A query-like result: supports `.select(...)` (used by enqueue) and can be awaited directly.
  const findJob = (id) => jobs.find((j) => j._id === id) || null;
  patch(JobRun, "findById", (id) => {
    const doc = findJob(id);
    return { select: () => Promise.resolve(doc), then: (ok, fail) => Promise.resolve(doc).then(ok, fail) };
  });
  patch(Notification, "findById", async (id) => notifications.get(String(id)) || null);
  return {
    jobs,
    notifications,
    addNotification: (id) => {
      const n = wrap({ _id: id, type: "subscription_expiring_soon", delivery: { email: "queued" } });
      notifications.set(String(id), n);
      return n;
    },
    restore: () => restore.reverse().forEach(([t, k, v]) => (t[k] = v)),
  };
};

const withMail = async (behaviour, fn) => {
  const original = emailService.sendMail;
  const calls = [];
  emailService.sendMail = async (message) => {
    calls.push(message);
    return behaviour(calls.length);
  };
  try {
    return await fn(calls);
  } finally {
    emailService.sendMail = original;
  }
};

const payloadFor = (notificationId) => ({
  notificationId,
  to: "candidate@example.test",
  subject: "Your plan renews soon",
  message: "Your plan renews in 7 days.",
  context: {},
});

test("a queued email is delivered once and marks the notification sent", async () => {
  const store = makeStore();
  try {
    const n = store.addNotification("n1");
    await withMail(() => ({ messageId: "m-1" }), async (calls) => {
      await queue.enqueue({ type: "notification.email", owner: "u1", payload: payloadFor("n1"), maxAttempts: 5 });
      assert.equal(calls.length, 1, "one transport call");
      assert.equal(calls[0].to, "candidate@example.test");
    });
    assert.equal(n.delivery.email, "sent");
    assert.equal(n.delivery.providerId, "m-1");
    assert.equal(store.jobs[0].status, "completed");
  } finally {
    store.restore();
  }
});

test("a sent notification is never emailed again (idempotent replay)", async () => {
  const store = makeStore();
  try {
    store.addNotification("n2").delivery = { email: "sent", providerId: "m-old" };
    await withMail(() => ({ messageId: "m-2" }), async (calls) => {
      await queue.enqueue({ type: "notification.email", owner: "u1", payload: payloadFor("n2"), maxAttempts: 5 });
      assert.equal(calls.length, 0, "no transport call for an already-sent notification");
    });
    assert.deepEqual(store.jobs[0].result, { skipped: true });
  } finally {
    store.restore();
  }
});

test("a failed send is recorded, does not fail the caller, and schedules a retry", async () => {
  const store = makeStore();
  try {
    const n = store.addNotification("n3");
    await withMail(
      () => {
        throw new Error("SMTP connection refused");
      },
      async () => {
        // The caller (for example a webhook or a notify() call) must not throw here.
        const job = await queue.enqueue({ type: "notification.email", owner: "u1", payload: payloadFor("n3"), maxAttempts: 5 });
        assert.equal(job.status, "queued", "still queued for retry");
        assert.equal(job.attempts, 1);
        assert.ok(job.nextAttemptAt.getTime() > Date.now(), "retry is scheduled in the future");
        assert.match(job.error.message, /SMTP connection refused/);
      },
    );
    assert.equal(n.delivery.email, "failed", "the notification reports the failed delivery");
  } finally {
    store.restore();
  }
});

test("a job that keeps failing stops after maxAttempts and is marked failed", async () => {
  const store = makeStore();
  try {
    store.addNotification("n4");
    await withMail(
      () => {
        throw new Error("SMTP timeout");
      },
      async () => {
        const job = await queue.enqueue({ type: "notification.email", owner: "u1", payload: payloadFor("n4"), maxAttempts: 2 });
        assert.equal(job.status, "queued");
        // Second attempt through execute() directly, as the worker would run it.
        const again = store.jobs[0];
        again.nextAttemptAt = new Date(0);
        await assert.rejects(queue.execute(again), /SMTP timeout/);
        assert.equal(again.status, "failed", "no retry after maxAttempts");
        assert.equal(again.attempts, 2);
      },
    );
  } finally {
    store.restore();
  }
});

test("other job types still surface their failures to the caller", async () => {
  const store = makeStore();
  try {
    await assert.rejects(
      queue.enqueue({ type: "no.such.job", owner: "u1", payload: {}, maxAttempts: 1 }),
      /No job handler registered/,
    );
  } finally {
    store.restore();
  }
});
