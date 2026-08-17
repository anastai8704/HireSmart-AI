/**
 * Footer.jsx
 * -----------------------------------------------------------------------------
 * Site footer. Kept simple and honest - it links only to pages that exist.
 */

import { Link } from "react-router-dom";
import { Code2, Sparkles } from "lucide-react";

const Footer = () => (
    <footer className="mt-auto border-t border-ink-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
                <div className="col-span-2 md:col-span-1">
                    <Link to="/" className="flex items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
                            <Sparkles className="h-4 w-4" aria-hidden="true" />
                        </span>
                        <span className="font-bold text-ink-900">
                            HireSmart<span className="text-brand-600"> AI</span>
                        </span>
                    </Link>

                    <p className="mt-3 max-w-xs text-sm text-ink-500">
                        An AI-powered applicant tracking system that scores resumes against
                        jobs and explains every result.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-ink-900">For candidates</h3>
                    <ul className="mt-3 space-y-2 text-sm text-ink-500">
                        <li>
                            <Link to="/jobs" className="transition-colors hover:text-brand-600">
                                Browse jobs
                            </Link>
                        </li>
                        <li>
                            <Link to="/resume-check" className="transition-colors hover:text-brand-600">
                                Free resume check
                            </Link>
                        </li>
                        <li>
                            <Link to="/register" className="transition-colors hover:text-brand-600">
                                Create an account
                            </Link>
                        </li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-ink-900">For recruiters</h3>
                    <ul className="mt-3 space-y-2 text-sm text-ink-500">
                        <li>
                            <Link
                                to="/register?role=recruiter"
                                className="transition-colors hover:text-brand-600"
                            >
                                Post a job
                            </Link>
                        </li>
                        <li>
                            <Link to="/login" className="transition-colors hover:text-brand-600">
                                Recruiter sign in
                            </Link>
                        </li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-sm font-semibold text-ink-900">Project</h3>
                    <ul className="mt-3 space-y-2 text-sm text-ink-500">
                        <li>
                            <a
                                href="https://github.com/anastai8704/HireSmart-AI"
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-600"
                            >
                                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                                Source code
                            </a>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </footer>
);

export default Footer;
