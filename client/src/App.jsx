/**
 * App.jsx
 * -----------------------------------------------------------------------------
 * The application shell: providers, layout and the full route map.
 *
 * PROVIDER ORDER MATTERS
 *   BrowserRouter  - must be outermost; AuthContext navigates on logout
 *     ToastProvider  - so any screen (including auth) can raise a toast
 *       AuthProvider - supplies the user to every route guard below
 *
 * ROUTE ORGANISATION
 *   Public        - anyone, signed in or not
 *   Public-only   - /login, /register (signed-in users get redirected away)
 *   Candidate     - requires role "candidate"
 *   Recruiter     - requires role "recruiter" or "admin"
 *   Admin         - requires role "admin"
 *
 * Pages are lazy-loaded with React.lazy so the browser downloads only the code
 * for the screen being viewed. This keeps the initial bundle small - a
 * candidate never downloads the admin dashboard.
 */

import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import Footer from "./components/layout/Footer";
import Navbar from "./components/layout/Navbar";
import ProtectedRoute, { PublicOnlyRoute } from "./components/layout/ProtectedRoute";
import ScrollToTop from "./components/layout/ScrollToTop";
import { LoadingState } from "./components/ui/States";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./components/ui/Toast";

/* ---- Public pages ---- */
const Landing = lazy(() => import("./pages/Landing"));
const Jobs = lazy(() => import("./pages/Jobs"));
const JobDetail = lazy(() => import("./pages/JobDetail"));
const ResumeCheck = lazy(() => import("./pages/ResumeCheck"));
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Forbidden = lazy(() => import("./pages/Forbidden"));

/* ---- Candidate pages ---- */
const CandidateDashboard = lazy(() => import("./pages/candidate/Dashboard"));
const MyApplications = lazy(() => import("./pages/candidate/MyApplications"));
const Recommendations = lazy(() => import("./pages/candidate/Recommendations"));
const ResumeHub = lazy(() => import("./pages/candidate/ResumeHub"));

/* ---- Recruiter pages ---- */
const RecruiterDashboard = lazy(() => import("./pages/recruiter/Dashboard"));
const ManageJobs = lazy(() => import("./pages/recruiter/ManageJobs"));
const JobApplicants = lazy(() => import("./pages/recruiter/JobApplicants"));
const RecruiterAnalytics = lazy(() => import("./pages/recruiter/Analytics"));

/* ---- Admin pages ---- */
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers"));

/* ---- Shared authenticated pages ---- */
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));

const App = () => (
    <BrowserRouter>
        <ToastProvider>
            <AuthProvider>
                {/* Restores scroll position to the top on every navigation. */}
                <ScrollToTop />

                <div className="flex min-h-screen flex-col">
                    <Navbar />

                    <main className="flex-1">
                        {/*
                          Suspense shows a fallback while a lazily-loaded page
                          chunk is being fetched.
                        */}
                        <Suspense fallback={<LoadingState message="Loading page..." />}>
                            <Routes>
                                {/* ---------- Public ---------- */}
                                <Route path="/" element={<Landing />} />
                                <Route path="/jobs" element={<Jobs />} />
                                <Route path="/jobs/:id" element={<JobDetail />} />
                                <Route path="/resume-check" element={<ResumeCheck />} />
                                <Route path="/forbidden" element={<Forbidden />} />

                                {/* ---------- Signed-out only ---------- */}
                                <Route element={<PublicOnlyRoute />}>
                                    <Route path="/login" element={<Login />} />
                                    <Route path="/register" element={<Register />} />
                                </Route>

                                {/* ---------- Any signed-in user ---------- */}
                                <Route element={<ProtectedRoute />}>
                                    <Route path="/profile" element={<Profile />} />
                                    <Route path="/settings" element={<Settings />} />
                                </Route>

                                {/* ---------- Candidate ---------- */}
                                <Route element={<ProtectedRoute allowedRoles={["candidate"]} />}>
                                    <Route path="/dashboard" element={<CandidateDashboard />} />
                                    <Route path="/my-applications" element={<MyApplications />} />
                                    <Route path="/recommendations" element={<Recommendations />} />
                                    <Route path="/my-resume" element={<ResumeHub />} />
                                </Route>

                                {/* ---------- Recruiter (admins may also manage jobs) ---------- */}
                                <Route element={<ProtectedRoute allowedRoles={["recruiter", "admin"]} />}>
                                    <Route path="/recruiter" element={<RecruiterDashboard />} />
                                    <Route path="/recruiter/jobs" element={<ManageJobs />} />
                                    <Route
                                        path="/recruiter/jobs/:jobId/applicants"
                                        element={<JobApplicants />}
                                    />
                                    <Route path="/recruiter/analytics" element={<RecruiterAnalytics />} />
                                </Route>

                                {/* ---------- Admin ---------- */}
                                <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
                                    <Route path="/admin" element={<AdminDashboard />} />
                                    <Route path="/admin/users" element={<ManageUsers />} />
                                </Route>

                                {/* Legacy/friendly redirect. */}
                                <Route path="/home" element={<Navigate to="/" replace />} />

                                {/* Anything else. */}
                                <Route path="*" element={<NotFound />} />
                            </Routes>
                        </Suspense>
                    </main>

                    <Footer />
                </div>
            </AuthProvider>
        </ToastProvider>
    </BrowserRouter>
);

export default App;
