import { describe, expect, it } from "vitest";
import { ROLE_PROFILES, profileRoleFor } from "./profileConfig";

const fieldNames = (role) =>
  ROLE_PROFILES[role].sections.flatMap((section) => section.fields.map((field) => field.key));

describe("profileRoleFor", () => {
  it("maps the auth role to the matching profile", () => {
    expect(profileRoleFor({ role: "admin" })).toBe("admin");
    expect(profileRoleFor({ role: "candidate" })).toBe("candidate");
    expect(profileRoleFor({ role: "recruiter" })).toBe("recruiter");
  });

  it("treats hiring roles as recruiter profiles", () => {
    expect(profileRoleFor({ role: "hiring_manager" })).toBe("recruiter");
    expect(profileRoleFor({ role: "owner" })).toBe("recruiter");
    expect(profileRoleFor({})).toBe("recruiter");
  });
});

describe("candidate profile", () => {
  it("covers the candidate's public and professional details", () => {
    const fields = fieldNames("candidate");
    for (const field of ["name", "headline", "phone", "location", "skills", "linkedin", "github", "portfolio", "bio"])
      expect(fields).toContain(field);
  });

  it("enables the professional details panel", () => {
    expect(ROLE_PROFILES.candidate.details).toBe(true);
  });

  it("does not show recruiter organisation fields", () => {
    const fields = fieldNames("candidate");
    for (const field of ["companyName", "department", "hiringSpecializations"])
      expect(fields).not.toContain(field);
  });
});

describe("recruiter profile", () => {
  it("covers company context and hiring specializations", () => {
    const fields = fieldNames("recruiter");
    for (const field of ["name", "headline", "phone", "location", "companyName", "department", "hiringSpecializations", "linkedin", "portfolio", "bio"])
      expect(fields).toContain(field);
  });

  it("does not make GitHub or developer skills mandatory", () => {
    const fields = fieldNames("recruiter");
    expect(fields).not.toContain("github");
    expect(fields).not.toContain("skills");
  });

  it("does not open the candidate details panel", () => {
    expect(ROLE_PROFILES.recruiter.details).toBeFalsy();
  });
});

describe("admin profile", () => {
  it("covers identity and contact only", () => {
    const fields = fieldNames("admin");
    for (const field of ["name", "headline", "phone", "location", "linkedin", "bio"])
      expect(fields).toContain(field);
  });

  it("hides every candidate and recruiter specific field", () => {
    const fields = fieldNames("admin");
    for (const field of ["skills", "github", "companyName", "department", "hiringSpecializations", "portfolio"])
      expect(fields).not.toContain(field);
  });

  it("labels the headline as a title", () => {
    const field = ROLE_PROFILES.admin.sections.flatMap((section) => section.fields).find((f) => f.key === "headline");
    expect(field.label).toBe("Title");
  });
});
