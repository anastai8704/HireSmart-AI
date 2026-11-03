/*
 * One profile implementation, configured per role.
 * - candidate: identity + skills + social links + full professional details
 *   (education, experience, projects, certifications — persisted to CandidateProfile)
 * - recruiter: identity + company/department + hiring specializations (no
 *   developer fields)
 * - admin: identity + title + organization context (no candidate/developer fields)
 */
const tagField = (key, label, placeholder, hint) => ({ key, label, placeholder, hint, type: "tags" });
const urlField = (key, label, placeholder) => ({ key, label, placeholder, type: "url" });

export const ROLE_PROFILES = {
  candidate: {
    title: "Candidate profile",
    description:
      "This is what hiring teams see on your profile and applications. Keep it current — it improves how you match with roles.",
    sections: [
      {
        title: "Basic information",
        fields: [
          { key: "name", label: "Full name" },
          { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
          {
            key: "headline",
            label: "Professional headline",
            placeholder: "e.g. Frontend developer, 4 years",
          },
          { key: "location", label: "Location", placeholder: "City, state" },
        ],
      },
      {
        title: "Skills & links",
        fields: [
          tagField("skills", "Skills", "React, TypeScript, Node.js", "Separate with commas"),
          urlField("linkedin", "LinkedIn", "https://linkedin.com/in/you"),
          urlField("github", "GitHub", "https://github.com/you"),
          urlField("portfolio", "Portfolio", "https://your-portfolio.com"),
        ],
      },
      {
        title: "About",
        fields: [
          {
            key: "bio",
            label: "About you",
            type: "textarea",
            rows: 4,
            placeholder: "A short introduction for hiring teams",
          },
        ],
      },
    ],
    details: true,
  },
  recruiter: {
    title: "Recruiter profile",
    description:
      "How you appear to candidates and your hiring team — your role, organization and the profiles you hire for.",
    sections: [
      {
        title: "Basic information",
        fields: [
          { key: "name", label: "Full name" },
          { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
          {
            key: "headline",
            label: "Professional headline",
            placeholder: "e.g. Talent lead for platform engineering",
          },
          { key: "location", label: "Location", placeholder: "City, state" },
        ],
      },
      {
        title: "Organization",
        fields: [
          { key: "companyName", label: "Company", placeholder: "Company name" },
          { key: "department", label: "Department", placeholder: "e.g. Engineering" },
          urlField("companyWebsite", "Company website", "https://company.com"),
        ],
      },
      {
        title: "Specializations & links",
        fields: [
          tagField(
            "hiringSpecializations",
            "Hiring specializations",
            "Backend, DevOps, Platform",
            "Roles or domains you hire for — separate with commas",
          ),
          urlField("linkedin", "LinkedIn", "https://linkedin.com/in/you"),
          urlField("portfolio", "Portfolio / website", "https://your-portfolio.com"),
        ],
      },
      {
        title: "About",
        fields: [
          {
            key: "bio",
            label: "About you",
            type: "textarea",
            rows: 4,
            placeholder: "A short introduction for candidates and your team",
          },
        ],
      },
    ],
  },
  admin: {
    title: "Administrator profile",
    description:
      "Your platform administrator identity. Only the essentials — no candidate or developer fields.",
    sections: [
      {
        title: "Basic information",
        fields: [
          { key: "name", label: "Full name" },
          { key: "headline", label: "Title", placeholder: "e.g. Platform operations" },
          { key: "phone", label: "Phone", placeholder: "+91 98765 43210" },
          { key: "location", label: "Location", placeholder: "City, state" },
        ],
      },
      {
        title: "Links",
        fields: [urlField("linkedin", "LinkedIn", "https://linkedin.com/in/you")],
      },
      {
        title: "About",
        fields: [
          {
            key: "bio",
            label: "About you",
            type: "textarea",
            rows: 4,
            placeholder: "A short introduction",
          },
        ],
      },
    ],
  },
};

export const profileRoleFor = (auth) =>
  auth.role === "admin" ? "admin" : auth.role === "candidate" ? "candidate" : "recruiter";

