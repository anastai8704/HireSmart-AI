process.env.NODE_ENV = "test";
process.env.PROCESS_JOBS_INLINE = "true";
const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");
const app = require("../app");
const { startDatabase, stopDatabase, clearDatabase } = require("./setup");
const Organization = require("../models/Organization");
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let ownerToken;
let organizationId;
let jobIds = {};

const registerOwner = async (email, orgName) => {
    const registration = await request(app).post("/api/v1/auth/register").send({ email, password: "StrongPassword123!", displayName: email.split("@")[0], accountIntent: "recruiter", organizationName: orgName, industry: "Software", termsConsent: true });
    assert.equal(registration.status, 201, JSON.stringify(registration.body));
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "StrongPassword123!" });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    return { token: login.body.data.accessToken, organization: registration.body.data.organization };
};

test.before(async () => { await startDatabase(); });
test.after(async () => { await stopDatabase(); });

const createPublishedJob = async (payload) => {
    const created = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(ownerToken)).send(payload);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const published = await request(app).post(`/api/v1/organizations/${organizationId}/jobs/${created.body.data.id}/publish`).set(auth(ownerToken));
    assert.equal(published.status, 200, JSON.stringify(published.body));
    return created.body.data;
};

test("marketplace: org owner publishes structured jobs for the public", async () => {
    await clearDatabase();
    const owner = await registerOwner("owner@marketplace.example", "Meridian Labs");
    ownerToken = owner.token;
    organizationId = owner.organization.id;

    jobIds.react = (await createPublishedJob({ title: "Senior React Developer", company: "Meridian Labs", location: "Pune", compensation: { min: 1500000, max: 2400000, currency: "INR", period: "year" }, experience: "4+ years", minExpYears: 4, maxExpYears: 8, educationRequired: "B.Tech / B.E.", benefits: ["Health insurance", "Remote Fridays"], jobType: "Full-Time", workplaceMode: "remote", description: "Build delightful, accessible product surfaces with React, TypeScript and modern testing.", requiredSkills: ["React", "TypeScript"], preferredSkills: ["Node.js"] })).id;
    jobIds.node = (await createPublishedJob({ title: "Node.js Backend Engineer", company: "Meridian Labs", location: "Pune", compensation: { min: 900000, max: 1500000, currency: "INR", period: "year" }, experience: "2+ years", minExpYears: 2, jobType: "Full-Time", workplaceMode: "hybrid", description: "Design resilient Node.js services and MongoDB data models powering a recruitment platform.", requiredSkills: ["Node.js", "MongoDB"], preferredSkills: [] })).id;
    jobIds.devops = (await createPublishedJob({ title: "DevOps Engineer", company: "Meridian Labs", location: "Bengaluru", compensation: { min: 2000000, max: 3200000, currency: "INR", period: "year" }, experience: "5+ years", minExpYears: 5, maxExpYears: 10, jobType: "Contract", workplaceMode: "onsite", description: "Own CI/CD, cloud infrastructure and observability for production Kubernetes workloads.", requiredSkills: ["Kubernetes", "AWS"], preferredSkills: ["Terraform"] })).id;
    const draft = await request(app).post(`/api/v1/organizations/${organizationId}/jobs`).set(auth(ownerToken)).send({ title: "Draft Role", company: "Meridian Labs", location: "Pune", experience: "1 year", jobType: "Internship", workplaceMode: "onsite", description: "An unpublished role that must never appear on public search results or company pages.", requiredSkills: ["Python"] });
    assert.equal(draft.status, 201);
    jobIds.draft = draft.body.data.id;
});

test("marketplace: public search filters by salary, experience, type, skills and work mode", async () => {
    let res = await request(app).get("/api/v1/jobs?workplaceMode=remote");
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.map((j) => j.id).sort(), [jobIds.react]);

    res = await request(app).get("/api/v1/jobs?minSalary=1800000");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.devops));
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.react));
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.node));

    res = await request(app).get("/api/v1/jobs?maxSalary=1000000");
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.devops));

    res = await request(app).get("/api/v1/jobs?maxExp=3");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.node));
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.devops));

    res = await request(app).get("/api/v1/jobs?minExp=5");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.devops));
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.react));

    res = await request(app).get("/api/v1/jobs?jobType=Contract");
    assert.deepEqual(res.body.data.map((j) => j.id), [jobIds.devops]);

    res = await request(app).get("/api/v1/jobs?skills=React,TypeScript");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.react));

    res = await request(app).get("/api/v1/jobs?skills=Kubernetes&sort=salary");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.devops));

    res = await request(app).get("/api/v1/jobs?location=Pune");
    assert.equal(res.body.data.length, 2);

    res = await request(app).get("/api/v1/jobs?query=devops");
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.devops));

    res = await request(app).get("/api/v1/jobs?postedWithin=d");
    assert.equal(res.body.data.length, 3);

    res = await request(app).get(`/api/v1/jobs?${new URLSearchParams({ workplaceMode: "remote", jobType: "Contract", minSalary: 1800000 }).toString()}`);
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.react));

    const all = await request(app).get("/api/v1/jobs");
    assert.ok(!all.body.data.map((j) => j.id).includes(jobIds.draft), "draft jobs must stay private");
});

test("marketplace: public job detail exposes structured fields and company link", async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobIds.react}`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const job = res.body.data;
    assert.equal(job.minExpYears, 4);
    assert.equal(job.maxExpYears, 8);
    assert.equal(job.educationRequired, "B.Tech / B.E.");
    assert.deepEqual(job.benefits, ["Health insurance", "Remote Fridays"]);
    assert.equal(job.industry, "Software");
    assert.equal(job.organization.slug, "meridian-labs");
    assert.equal(job.compensation.min, 1500000);
});

test("marketplace: related jobs share skills and never include the job itself", async () => {
    const res = await request(app).get(`/api/v1/jobs/${jobIds.react}/related`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(!res.body.data.map((j) => j.id).includes(jobIds.react));
    assert.ok(res.body.data.map((j) => j.id).includes(jobIds.node));
    const missing = await request(app).get("/api/v1/jobs/000000000000000000000000/related");
    assert.equal(missing.status, 404);
});

test("marketplace: company pages are public and list only open roles", async () => {
    const list = await request(app).get("/api/v1/companies");
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].slug, "meridian-labs");
    assert.equal(list.body.data[0].openRoles, 3);

    const detail = await request(app).get("/api/v1/companies/meridian-labs");
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.data.name, "Meridian Labs");
    assert.equal(detail.body.data.openRoles, 3);

    const jobs = await request(app).get("/api/v1/companies/meridian-labs/jobs?limit=2");
    assert.equal(jobs.status, 200, JSON.stringify(jobs.body));
    assert.equal(jobs.body.data.length, 2);
    assert.equal(jobs.body.meta.hasMore, true);

    const missing = await request(app).get("/api/v1/companies/does-not-exist");
    assert.equal(missing.status, 404);
    const missingJobs = await request(app).get("/api/v1/companies/does-not-exist/jobs");
    assert.equal(missingJobs.status, 404);
});

test("marketplace: organization updates are whitelisted (mass-assignment protection)", async () => {
    const res = await request(app).patch(`/api/v1/organizations/${organizationId}`).set(auth(ownerToken)).send({ name: "Meridian Labs Pvt Ltd", logo: "https://example.com/logo.png", about: "We build hiring infrastructure.", status: "suspended", settings: { aiEnabled: false } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.name, "Meridian Labs Pvt Ltd");
    assert.equal(res.body.data.logo, "https://example.com/logo.png");
    assert.equal(res.body.data.about, "We build hiring infrastructure.");
    assert.equal(res.body.data.status, "active", "status must not be assignable through the update endpoint");
    assert.equal(res.body.data.settings.aiEnabled, true, "settings must not be assignable through the update endpoint");
    const invalid = await request(app).patch(`/api/v1/organizations/${organizationId}`).set(auth(ownerToken)).send({ status: "suspended" });
    assert.equal(invalid.status, 422);
    const direct = await Organization.findById(organizationId);
    assert.equal(direct.status, "active");
});

test("marketplace: tenant isolation — another org cannot see these jobs in company listing", async () => {
    const other = await registerOwner("owner@otherco.example", "Other Co");
    const created = await request(app).post(`/api/v1/organizations/${other.organization.id}/jobs`).set(auth(other.token)).send({ title: "Private Other Role", company: "Other Co", location: "Delhi", experience: "1 year", jobType: "Full-Time", workplaceMode: "onsite", description: "A job from a different organization that must stay isolated in every public surface.", requiredSkills: ["Java"] });
    assert.equal(created.status, 201);
    const list = await request(app).get("/api/v1/companies/meridian-labs/jobs?limit=100");
    assert.ok(!list.body.data.map((j) => j.id).includes(created.body.data.id));
});
