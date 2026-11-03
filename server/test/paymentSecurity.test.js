// Phase 0.5 regression coverage: sandbox payments, plan activation, replay protection and
// organization billing authorization. Runs against the test database (CI service container).
process.env.NODE_ENV = "test";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const { PaymentTransaction } = require("../models/PaymentTransaction");
const { Membership } = require("../models/Membership");
const Subscription = require("../models/Subscription");

const PASSWORD = "StrongPassword123!";
const API = "/api/v1";
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const register = async ({ email, intent, organizationName }) => {
  const reg = await request(app).post(`${API}/auth/register`).send({
    email,
    password: PASSWORD,
    displayName: email.split("@")[0],
    accountIntent: intent,
    organizationName,
    termsConsent: true,
  });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const login = await request(app).post(`${API}/auth/login`).send({ email, password: PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return {
    token: login.body.data.accessToken,
    userId: String(reg.body.data.user.id || reg.body.data.user._id),
    orgId: reg.body.data.organization ? String(reg.body.data.organization.id) : null,
  };
};

const checkout = (actor, planTier, orgId) => {
  const req = request(app).post(`${API}/subscriptions/checkout`).set(auth(actor.token));
  if (orgId) req.set("X-Organization-Id", orgId);
  return req.send({ planTier });
};

const verify = (actor, body, orgId) => {
  const req = request(app).post(`${API}/subscriptions/verify-payment`).set(auth(actor.token));
  if (orgId) req.set("X-Organization-Id", orgId);
  return req.send(body);
};

// The sandbox helper is the only proof the server issues; tests echo it back like the UI does.
const proofFrom = (checkoutResponse, planTier) => ({
  orderId: checkoutResponse.body.data.simulationHelper.orderId,
  paymentId: checkoutResponse.body.data.simulationHelper.paymentId,
  signature: checkoutResponse.body.data.simulationHelper.signature,
  planTier,
});

const currentSubscription = async (actor, orgId) => {
  const req = request(app).get(`${API}/subscriptions/current`).set(auth(actor.token));
  if (orgId) req.set("X-Organization-Id", orgId);
  const res = await req;
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.data.subscription;
};

let candidateA;
let candidateB;
let recruiterX; // owner of organization X
let recruiterY; // owner of organization Y (unrelated to X)

test.before(async () => {
  await startDatabase();
});

test.after(async () => {
  await stopDatabase();
});

test("seed two candidates and two recruiter organizations", async () => {
  await clearDatabase();
  candidateA = await register({ email: "pay-cand-a@example.test", intent: "candidate" });
  candidateB = await register({ email: "pay-cand-b@example.test", intent: "candidate" });
  recruiterX = await register({
    email: "pay-recruiter-x@example.test",
    intent: "recruiter",
    organizationName: "Payment Test Org X",
  });
  recruiterY = await register({
    email: "pay-recruiter-y@example.test",
    intent: "recruiter",
    organizationName: "Payment Test Org Y",
  });
  assert.ok(recruiterX.orgId && recruiterY.orgId);
});

test("payments fail closed when PAYMENT_MODE is disabled and create no transaction", async () => {
  const previous = process.env.PAYMENT_MODE;
  process.env.PAYMENT_MODE = "disabled";
  try {
    const res = await checkout(candidateA, "candidate_plus");
    assert.equal(res.status, 503, JSON.stringify(res.body));
    assert.equal(res.body.code, "PAYMENT_NOT_CONFIGURED");
  } finally {
    process.env.PAYMENT_MODE = previous;
  }
  assert.equal(await PaymentTransaction.countDocuments({ subscriberId: candidateA.userId }), 0);
});

test("the legacy sim_sig_<orderId> forgery cannot activate a paid plan", async () => {
  const res = await checkout(candidateA, "candidate_plus");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const orderId = res.body.data.order.orderId;

  const forged = await verify(candidateA, {
    orderId,
    paymentId: "pay_forged_by_client",
    signature: `sim_sig_${orderId}`,
    planTier: "candidate_plus",
  });
  assert.equal(forged.status, 400, JSON.stringify(forged.body));
  assert.equal(forged.body.code, "PAYMENT_VERIFICATION_FAILED");

  const sub = await currentSubscription(candidateA);
  assert.equal(sub.planTier, "candidate_free", "a forged proof must not change the plan");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: orderId });
  assert.equal(txn.status, "failed");
});

test("a verified sandbox payment activates the plan once; replays are rejected", async () => {
  const res = await checkout(candidateA, "candidate_plus");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const proof = proofFrom(res, "candidate_plus");

  const first = await verify(candidateA, proof);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.subscription.planTier, "candidate_plus");
  assert.equal(first.body.data.transaction.status, "captured");
  assert.equal(
    (first.body.data.transaction.metadata || {}).expectedPaymentId,
    undefined,
    "server-only field is not returned",
  );

  const replay = await verify(candidateA, proof);
  assert.equal(replay.status, 409, JSON.stringify(replay.body));
  assert.equal(replay.body.code, "PAYMENT_ALREADY_PROCESSED");

  const captured = await PaymentTransaction.countDocuments({
    gatewayOrderId: proof.orderId,
    status: "captured",
  });
  assert.equal(captured, 1);
  const sub = await currentSubscription(candidateA);
  assert.equal(sub.planTier, "candidate_plus");
  assert.equal(sub.priceInr, 149);
});

test("the client cannot choose the price, an unlisted plan or unknown fields", async () => {
  const withPrice = await request(app)
    .post(`${API}/subscriptions/checkout`)
    .set(auth(candidateB.token))
    .send({ planTier: "candidate_plus", priceInr: 1, amount: 1 });
  assert.equal(withPrice.status, 422, JSON.stringify(withPrice.body));

  const freePlan = await checkout(candidateB, "candidate_free");
  assert.equal(freePlan.status, 400);
  assert.equal(freePlan.body.code, "PLAN_NOT_PURCHASABLE");

  const res = await checkout(candidateB, "candidate_plus");
  assert.equal(res.status, 200);
  assert.equal(res.body.data.transaction.amount, 149, "the amount comes from the server plan");
});

test("a verification naming a different plan than the order is rejected and changes nothing", async () => {
  const res = await checkout(candidateB, "candidate_plus");
  const wrongPlan = await verify(candidateB, { ...proofFrom(res, "candidate_plus"), planTier: "candidate_free" });
  assert.equal(wrongPlan.status, 400);
  assert.equal(wrongPlan.body.code, "PLAN_MISMATCH");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: res.body.data.order.orderId });
  assert.equal(txn.status, "initiated", "a mismatched plan leaves the order untouched");
});

test("a payment proof cannot be redirected to another payment id or an unknown order", async () => {
  const res = await checkout(candidateB, "candidate_plus");
  const proof = proofFrom(res, "candidate_plus");

  const redirected = await verify(candidateB, { ...proof, paymentId: "pay_other_payment" });
  assert.equal(redirected.status, 400, JSON.stringify(redirected.body));
  assert.equal(redirected.body.code, "PAYMENT_VERIFICATION_FAILED");

  const unknown = await verify(candidateB, { ...proof, orderId: "order_sim_does_not_exist" });
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, "PAYMENT_ORDER_NOT_FOUND");
});

test("another candidate cannot verify or activate someone else's order", async () => {
  const res = await checkout(candidateA, "candidate_plus");
  const proof = proofFrom(res, "candidate_plus");

  const hijack = await verify(candidateB, proof);
  assert.equal(hijack.status, 404, "other users receive the same not-found response");
  assert.equal(hijack.body.code, "PAYMENT_ORDER_NOT_FOUND");

  const txn = await PaymentTransaction.findOne({ gatewayOrderId: proof.orderId });
  assert.equal(txn.status, "initiated");
});

test("a cancelled checkout (no verification call) never activates a plan", async () => {
  const shopper = await register({ email: "pay-cancel@example.test", intent: "candidate" });
  const res = await checkout(shopper, "candidate_plus");
  assert.equal(res.status, 200);
  const sub = await currentSubscription(shopper);
  assert.equal(sub.planTier, "candidate_free");
  const txn = await PaymentTransaction.findOne({ gatewayOrderId: res.body.data.order.orderId });
  assert.equal(txn.status, "initiated");
});

test("an invalid signature leaves the subscription inactive", async () => {
  const shopper = await register({ email: "pay-badsig@example.test", intent: "candidate" });
  const res = await checkout(shopper, "candidate_plus");
  const bad = await verify(shopper, { ...proofFrom(res, "candidate_plus"), signature: "0".repeat(64) });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.code, "PAYMENT_VERIFICATION_FAILED");
  const sub = await currentSubscription(shopper);
  assert.equal(sub.planTier, "candidate_free");
});

test("concurrent verification of one order captures it exactly once", async () => {
  const shopper = await register({ email: "pay-race@example.test", intent: "candidate" });
  const res = await checkout(shopper, "candidate_plus");
  const proof = proofFrom(res, "candidate_plus");

  const [first, second] = await Promise.all([verify(shopper, proof), verify(shopper, proof)]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  const captured = await PaymentTransaction.countDocuments({ gatewayOrderId: proof.orderId, status: "captured" });
  assert.equal(captured, 1);
});

test("recruiter plans require an organization the caller administers", async () => {
  const noOrg = await checkout(recruiterX, "recruiter_starter");
  assert.equal(noOrg.status, 400);
  assert.equal(noOrg.body.code, "ORGANIZATION_REQUIRED");

  const notMember = await checkout(recruiterX, "recruiter_starter", recruiterY.orgId);
  assert.equal(notMember.status, 404, "a non-member organization looks like it does not exist");
  assert.equal(notMember.body.code, "RESOURCE_NOT_FOUND");

  const candidateOnOrgPlan = await checkout(candidateA, "recruiter_starter", recruiterX.orgId);
  assert.equal(candidateOnOrgPlan.status, 403);
  assert.equal(candidateOnOrgPlan.body.code, "FORBIDDEN");

  const recruiterOnCandidatePlan = await checkout(recruiterX, "candidate_plus");
  assert.equal(recruiterOnCandidatePlan.status, 403);
});

test("an organization owner can purchase and activate an organization plan", async () => {
  const res = await checkout(recruiterX, "recruiter_starter", recruiterX.orgId);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.transaction.subscriberType, "organization");
  assert.equal(String(res.body.data.transaction.subscriberId), recruiterX.orgId);
  assert.equal(res.body.data.transaction.amount, 999);

  const verified = await verify(recruiterX, proofFrom(res, "recruiter_starter"), recruiterX.orgId);
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  const sub = await currentSubscription(recruiterX, recruiterX.orgId);
  assert.equal(sub.planTier, "recruiter_starter");
  assert.equal(String(sub.subscriberId), recruiterX.orgId);
});

test("organization billing is scoped to the caller's organization", async () => {
  // Invoices for X are visible only to X's administrators.
  const foreignInvoices = await request(app)
    .get(`${API}/subscriptions/invoices`)
    .set(auth(recruiterY.token))
    .set("X-Organization-Id", recruiterX.orgId);
  assert.equal(foreignInvoices.status, 404);

  const ownInvoices = await request(app)
    .get(`${API}/subscriptions/invoices`)
    .set(auth(recruiterY.token))
    .set("X-Organization-Id", recruiterY.orgId);
  assert.equal(ownInvoices.status, 200);
  assert.equal(ownInvoices.body.data.length, 0, "org Y must not see org X invoices");

  const xInvoices = await request(app)
    .get(`${API}/subscriptions/invoices`)
    .set(auth(recruiterX.token))
    .set("X-Organization-Id", recruiterX.orgId);
  assert.equal(xInvoices.status, 200);
  assert.equal(xInvoices.body.data.length, 1);

  // Cancelling requires organization context; a missing header must never cancel an arbitrary org.
  const noHeaderCancel = await request(app).post(`${API}/subscriptions/cancel`).set(auth(recruiterY.token));
  assert.equal(noHeaderCancel.status, 400);
  assert.equal(noHeaderCancel.body.code, "ORGANIZATION_REQUIRED");

  const foreignCancel = await request(app)
    .post(`${API}/subscriptions/cancel`)
    .set(auth(recruiterY.token))
    .set("X-Organization-Id", recruiterX.orgId);
  assert.equal(foreignCancel.status, 404);

  const xSub = await Subscription.findOne({ subscriberType: "organization", subscriberId: recruiterX.orgId });
  assert.equal(xSub.cancelAtPeriodEnd, false, "org X subscription untouched by org Y");
});

test("a recruiter-role member without billing permission cannot manage organization billing", async () => {
  // Recruiter with their own company, added to org X with the "recruiter" role (no organization.manage).
  const member = await register({
    email: "pay-member@example.test",
    intent: "recruiter",
    organizationName: "Member Own Company",
  });
  await Membership.create({
    organization: recruiterX.orgId,
    user: member.userId,
    role: "recruiter",
    status: "active",
  });

  const attemptCheckout = await checkout(member, "recruiter_growth", recruiterX.orgId);
  assert.equal(attemptCheckout.status, 404, "missing billing permission looks like no membership");

  const invoices = await request(app)
    .get(`${API}/subscriptions/invoices`)
    .set(auth(member.token))
    .set("X-Organization-Id", recruiterX.orgId);
  assert.equal(invoices.status, 404);

  // Read-only plan visibility is open to any active member of the organization.
  const plan = await currentSubscription(member, recruiterX.orgId);
  assert.equal(plan.planTier, "recruiter_starter");
});
