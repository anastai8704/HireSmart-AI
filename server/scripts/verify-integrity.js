const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const { connectDB, disconnectDB } = require("../config/db");

async function check() {
  await connectDB();
  const db = mongoose.connection.db;

  const users = await db.collection("users").find({}).toArray();
  const orgs = await db.collection("organizations").find({}).toArray();
  const jobs = await db.collection("jobs").find({}).toArray();
  const apps = await db.collection("applications").find({}).toArray();
  const placements = await db.collection("placements").find({}).toArray();
  const memberships = await db.collection("memberships").find({}).toArray();
  const profiles = await db.collection("candidateprofiles").find({}).toArray();
  const resumes = await db.collection("resumes").find({}).toArray();
  const subscriptions = await db.collection("subscriptions").find({}).toArray();
  const interviews = await db.collection("interviews").find({}).toArray();

  console.log("=== INTEGRITY VERIFICATION RESULTS ===");
  console.log(`Users:               ${users.length}`);
  console.log(`Organizations:       ${orgs.length}`);
  console.log(`Jobs:                ${jobs.length}`);
  console.log(`Applications:        ${apps.length}`);
  console.log(`Placements:          ${placements.length}`);
  console.log(`Memberships:         ${memberships.length}`);
  console.log(`Candidate Profiles:  ${profiles.length}`);
  console.log(`Resumes:             ${resumes.length}`);
  console.log(`Subscriptions:       ${subscriptions.length}`);
  console.log(`Interviews:          ${interviews.length}`);

  const userIds = new Set(users.map((u) => String(u._id)));
  const jobIds = new Set(jobs.map((j) => String(j._id)));
  const orgIds = new Set(orgs.map((o) => String(o._id)));
  const appIds = new Set(apps.map((a) => String(a._id)));

  let appErrors = 0;
  for (const a of apps) {
    if (!jobIds.has(String(a.job))) { console.error("App invalid job:", a._id); appErrors++; }
    if (!userIds.has(String(a.candidate))) { console.error("App invalid candidate:", a._id); appErrors++; }
    if (!orgIds.has(String(a.organization))) { console.error("App invalid org:", a._id); appErrors++; }
  }
  console.log(`Application Reference Errors: ${appErrors}`);

  let placementErrors = 0;
  for (const p of placements) {
    if (!jobIds.has(String(p.job))) { console.error("Placement invalid job:", p._id); placementErrors++; }
    if (!userIds.has(String(p.candidate))) { console.error("Placement invalid candidate:", p._id); placementErrors++; }
    if (!orgIds.has(String(p.organization))) { console.error("Placement invalid org:", p._id); placementErrors++; }
    if (!appIds.has(String(p.application))) { console.error("Placement invalid app:", p._id); placementErrors++; }
  }
  console.log(`Placement Reference Errors:   ${placementErrors}`);

  let membershipErrors = 0;
  for (const m of memberships) {
    if (!userIds.has(String(m.user))) { console.error("Membership invalid user:", m._id); membershipErrors++; }
    if (!orgIds.has(String(m.organization))) { console.error("Membership invalid org:", m._id); membershipErrors++; }
  }
  console.log(`Membership Reference Errors:  ${membershipErrors}`);

  let interviewErrors = 0;
  for (const iv of interviews) {
    if (!userIds.has(String(iv.candidate))) { console.error("Interview invalid candidate:", iv._id); interviewErrors++; }
    if (!orgIds.has(String(iv.organization))) { console.error("Interview invalid org:", iv._id); interviewErrors++; }
    if (!appIds.has(String(iv.application))) { console.error("Interview invalid app:", iv._id); interviewErrors++; }
  }
  console.log(`Interview Reference Errors:   ${interviewErrors}`);

  await disconnectDB();
}

check().catch((err) => {
  console.error("Error during integrity check:", err);
  process.exit(1);
});
