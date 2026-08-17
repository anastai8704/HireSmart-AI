/**
 * ResumeCheck.jsx
 * -----------------------------------------------------------------------------
 * The public, no-signup resume analyzer.
 *
 * WHY A PUBLIC PAGE EXISTS AT ALL
 * It is the product's shop window. A visitor can paste their resume and get a
 * genuinely useful report in five seconds, which demonstrates the AI before
 * asking for anything. For a demo or a viva it is also the fastest possible way
 * to show the engine working end to end.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { FileSearch, Sparkles, Wand2 } from "lucide-react";

import Button from "../components/ui/Button";
import ResumeReport from "../components/ai/ResumeReport";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { InlineError } from "../components/ui/States";
import { Textarea } from "../components/ui/Input";
import { aiApi } from "../lib/api";
import { useMutation } from "../hooks/useApi";

/** A realistic sample so visitors can try the tool with one click. */
const SAMPLE_RESUME = `Priya Sharma
Full Stack Developer
Email: priya.sharma@example.com | Phone: +91 98765 43210
linkedin.com/in/priyasharma | github.com/priyasharma

SUMMARY
Full stack developer with 3 years of experience building web applications
with React, Node.js and MongoDB.

SKILLS
JavaScript, TypeScript, React, Redux, Node.js, Express, MongoDB, PostgreSQL,
Docker, AWS, Git, Jest, REST APIs, Tailwind CSS

EXPERIENCE
Software Engineer, Nexus Technologies (2022 - 2025)
- Built a customer portal in React and Node.js used by 25000 monthly users
- Reduced page load time by 38% by code-splitting and adding a CDN
- Designed REST APIs with Express and MongoDB aggregation pipelines
- Automated deployments with Docker and GitHub Actions

PROJECTS
Inventory Tracker - A MERN application that manages stock across 12 warehouses
and cut manual reconciliation time by 60%.

EDUCATION
Bachelor of Engineering in Computer Science, Pune University, 2022`;

const ResumeCheck = () => {
    const [resumeText, setResumeText] = useState("");

    const { mutate, data, error, isLoading, reset } = useMutation(aiApi.analyzeText);

    const handleSubmit = async (event) => {
        event.preventDefault();

        try {
            await mutate(resumeText);
        } catch {
            // The error is already captured by the hook and rendered below.
        }
    };

    const report = data?.data;
    const characterCount = resumeText.trim().length;
    const isTooShort = characterCount > 0 && characterCount < 50;

    return (
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8 text-center">
                <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <FileSearch className="h-6 w-6" aria-hidden="true" />
                </span>

                <h1 className="text-3xl font-bold tracking-tight text-ink-900">
                    Free ATS resume check
                </h1>

                <p className="mx-auto mt-2 max-w-2xl text-ink-500">
                    Paste your resume and see how an applicant tracking system reads it - the
                    score, what it could extract, and exactly what to fix. Nothing is saved.
                </p>
            </header>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Your resume text</CardTitle>
                    <p className="text-sm text-ink-500">
                        Open your resume, select all, copy and paste it below.
                    </p>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && <InlineError error={error} />}

                        <Textarea
                            rows={14}
                            placeholder="Paste the full text of your resume here..."
                            aria-label="Resume text"
                            value={resumeText}
                            onChange={(event) => setResumeText(event.target.value)}
                            error={isTooShort ? "Please paste at least 50 characters" : undefined}
                            hint={`${characterCount.toLocaleString()} characters`}
                        />

                        <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                                type="submit"
                                isLoading={isLoading}
                                disabled={characterCount < 50}
                                leftIcon={<Sparkles className="h-4 w-4" />}
                            >
                                Analyse my resume
                            </Button>

                            <Button
                                type="button"
                                variant="secondary"
                                leftIcon={<Wand2 className="h-4 w-4" />}
                                onClick={() => {
                                    setResumeText(SAMPLE_RESUME);
                                    reset();
                                }}
                            >
                                Use a sample resume
                            </Button>

                            {(resumeText || report) && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => {
                                        setResumeText("");
                                        reset();
                                    }}
                                >
                                    Clear
                                </Button>
                            )}
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* ---------- Report ---------- */}
            {report && (
                <section className="animate-[fade-up_0.4s_ease-out_both]">
                    <ResumeReport report={report} />

                    <Card className="mt-6 border-brand-200 bg-brand-50">
                        <CardContent className="flex flex-col items-center gap-4 p-6 text-center sm:flex-row sm:text-left">
                            <div className="flex-1">
                                <h3 className="text-base font-semibold text-ink-900">
                                    Want this checked against real jobs?
                                </h3>

                                <p className="mt-1 text-sm text-ink-600">
                                    Create a free account to upload your resume once, get matched
                                    to open roles automatically, and track every application.
                                </p>
                            </div>

                            <Button as={Link} to="/register" className="shrink-0">
                                Create free account
                            </Button>
                        </CardContent>
                    </Card>
                </section>
            )}
        </div>
    );
};

export default ResumeCheck;
