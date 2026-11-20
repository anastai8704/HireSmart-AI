import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Video,
} from "lucide-react";
import Button from "../ui/Button";
import Badge from "../ui/Badge";
import Modal from "../ui/Modal";
import { LoadingState, ErrorState, EmptyState } from "../ui/States";
import { adminApi, downloadBlob } from "../../lib/api";
import { formatDate, formatDateTime, formatSalary, initials } from "../../lib/utils";
import { useToast } from "../ui/useToast";

export const Candidate360Drawer = ({ candidateId, onClose }) => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [downloadingId, setDownloadingId] = useState(null);

  const query = useQuery({
    queryKey: ["admin-candidate-360", candidateId],
    queryFn: () => adminApi.candidate360(candidateId),
    enabled: Boolean(candidateId),
  });

  const data = query.data?.data;
  const candidate = data?.candidate;
  const resumes = data?.resumes || [];
  const applications = data?.applications || [];
  const interviews = data?.interviews || [];
  const placements = data?.placements || [];

  const handleDownloadResume = async (versionId, originalName) => {
    setDownloadingId(versionId);
    try {
      const res = await adminApi.candidateResumeDownload(candidateId, versionId);
      downloadBlob(res.data, originalName || "candidate-resume.pdf");
      toast.success("Resume downloaded");
    } catch (err) {
      toast.error(err.message || "Failed to download resume");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <Modal
      isOpen={Boolean(candidateId)}
      onClose={onClose}
      title="Candidate 360° Profile"
      description="Holistic candidate journey, credentials, applications, interviews, and verified placements."
      size="3xl"
    >
      {query.isLoading ? (
        <LoadingState message="Loading candidate journey…" />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !candidate ? (
        <EmptyState title="Candidate not found" description="The requested profile could not be loaded." />
      ) : (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="flex flex-col gap-4 rounded-2xl border border-ink-100 bg-ink-50/50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-700 text-xl font-bold text-white shadow-sm">
                {initials(candidate.name)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-bold text-ink-950">{candidate.name}</h2>
                  <Badge tone={candidate.accountStatus === "active" ? "success" : "danger"}>
                    {candidate.accountStatus}
                  </Badge>
                  {candidate.emailVerified ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-success-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Email verified
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-warning-700">Email unverified</span>
                  )}
                </div>
                {candidate.headline && (
                  <p className="mt-0.5 text-sm font-medium text-ink-700">{candidate.headline}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" /> {candidate.email}
                  </span>
                  {candidate.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {candidate.phone}
                    </span>
                  )}
                  {candidate.location && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" /> {candidate.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Joined {formatDate(candidate.createdAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* KPI Metrics Summary Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 text-center">
            <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Resumes</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">{resumes.length}</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Applications</p>
              <p className="mt-1 text-2xl font-extrabold text-brand-700">{applications.length}</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Interviews</p>
              <p className="mt-1 text-2xl font-extrabold text-ink-900">{interviews.length}</p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Offers</p>
              <p className="mt-1 text-2xl font-extrabold text-success-700">
                {applications.filter((a) => a.offer).length}
              </p>
            </div>
            <div className="rounded-xl border border-ink-100 bg-white p-3 shadow-xs col-span-2 sm:col-span-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">Verified Placements</p>
              <p className="mt-1 text-2xl font-extrabold text-success-800">
                {placements.filter((p) => p.isVerified).length}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-ink-200 text-sm font-semibold">
            {[
              { key: "overview", label: "Profile & Skills" },
              { key: "applications", label: `Applications (${applications.length})` },
              { key: "interviews", label: `Interviews (${interviews.length})` },
              { key: "placements", label: `Employment & Placements (${placements.length})` },
              { key: "resumes", label: `Resumes (${resumes.length})` },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`border-b-2 px-4 py-2.5 transition-colors ${
                  activeTab === tab.key
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-ink-500 hover:text-ink-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Profile & Skills */}
          {activeTab === "overview" && (
            <div className="space-y-4">
              {candidate.bio && (
                <div className="rounded-xl border border-ink-100 bg-white p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Bio</h4>
                  <p className="mt-1.5 text-sm text-ink-800 whitespace-pre-line">{candidate.bio}</p>
                </div>
              )}

              <div className="rounded-xl border border-ink-100 bg-white p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Skills</h4>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(candidate.skills || []).length > 0 ? (
                    candidate.skills.map((s, idx) => (
                      <span
                        key={idx}
                        className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-800"
                      >
                        {typeof s === "string" ? s : s.name || s.skill}
                      </span>
                    ))
                  ) : (
                    <p className="text-xs text-ink-400">No skills listed on profile.</p>
                  )}
                </div>
              </div>

              {(candidate.experience || []).length > 0 && (
                <div className="rounded-xl border border-ink-100 bg-white p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">Experience</h4>
                  <div className="divide-y divide-ink-100">
                    {candidate.experience.map((exp, idx) => (
                      <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                        <p className="text-sm font-bold text-ink-900">{exp.title || exp.role}</p>
                        <p className="text-xs text-ink-600">{exp.company} {exp.duration ? `· ${exp.duration}` : ""}</p>
                        {exp.description && <p className="mt-1 text-xs text-ink-500">{exp.description}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Applications & Offers */}
          {activeTab === "applications" && (
            <div className="space-y-3">
              {applications.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-400">No job applications submitted yet.</p>
              ) : (
                applications.map((app) => (
                  <div key={app.id} className="rounded-xl border border-ink-100 bg-white p-4 space-y-2 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-ink-950">{app.jobTitle}</h4>
                        <p className="text-xs text-ink-600">
                          {app.organizationName} {app.workplaceMode ? `· ${app.workplaceMode}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {app.matchScore && (
                          <span className="rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">
                            {app.matchScore}% Match
                          </span>
                        )}
                        <Badge tone={app.status === "hired" ? "success" : app.status === "rejected" ? "danger" : "brand"}>
                          {app.status}
                        </Badge>
                      </div>
                    </div>

                    {app.offer && (
                      <div className="mt-2 rounded-lg border border-success-200 bg-success-50/60 p-3 text-xs">
                        <div className="flex items-center justify-between font-bold text-success-900">
                          <span>Offer: {app.offer.status?.toUpperCase()}</span>
                          {app.offer.ctc && <span>{formatSalary(app.offer.ctc)} / year</span>}
                        </div>
                        <div className="mt-1 text-success-800 flex flex-wrap gap-x-3">
                          {app.offer.designation && <span>Role: {app.offer.designation}</span>}
                          {app.offer.joiningDate && <span>Joining: {formatDate(app.offer.joiningDate)}</span>}
                          {app.offer.issuedAt && <span>Issued: {formatDate(app.offer.issuedAt)}</span>}
                        </div>
                      </div>
                    )}

                    <p className="text-[11px] text-ink-400">Applied on {formatDate(app.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Interviews */}
          {activeTab === "interviews" && (
            <div className="space-y-3">
              {interviews.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-400">No interviews scheduled yet.</p>
              ) : (
                interviews.map((item) => (
                  <div key={item.id} className="rounded-xl border border-ink-100 bg-white p-4 space-y-2 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-ink-950">{item.jobTitle}</h4>
                        <p className="text-xs text-ink-600">
                          {item.organizationName} · Round {item.round} ({item.type || "Interview"})
                        </p>
                      </div>
                      <Badge tone={item.status === "completed" ? "success" : item.status === "in_progress" ? "brand" : "neutral"}>
                        {item.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-600">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {item.scheduledStart ? formatDateTime(item.scheduledStart, item.timezone) : "Time not set"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Video className="h-3.5 w-3.5" />
                        {item.meetingProvider === "google_meet"
                          ? "Google Meet"
                          : item.meetingProvider === "manual"
                          ? "Manual Link"
                          : "Meeting not set"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 4: Employment & Placements (Platform Verified vs Self Reported) */}
          {activeTab === "placements" && (
            <div className="space-y-3">
              {placements.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-400">No placement or employment records found.</p>
              ) : (
                placements.map((p) => (
                  <div key={p.id} className="rounded-xl border border-ink-100 bg-white p-4 space-y-3 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="font-bold text-ink-950">{p.jobTitle}</h4>
                        <p className="text-xs text-ink-600">{p.organizationName}</p>
                      </div>
                      <div>
                        {p.isVerified ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-800 border border-success-200">
                            <ShieldCheck className="h-3.5 w-3.5" /> Platform Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-50 px-2.5 py-1 text-xs font-bold text-warning-800 border border-warning-200">
                            Self-Reported / Awaiting Verification
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg bg-ink-50 p-3 text-xs space-y-1">
                      <p className="font-medium text-ink-800">
                        Status: <span className="font-bold">{p.status}</span>
                      </p>
                      <p className="text-ink-600">
                        Reported By: <span className="font-semibold capitalize">{p.reportedBy}</span>
                      </p>
                      {p.isVerified && p.verifiedAt && (
                        <p className="text-success-700">
                          Verified by Platform on {formatDate(p.verifiedAt)}
                        </p>
                      )}
                      {p.joinedDate && (
                        <p className="text-ink-600">Joined on {formatDate(p.joinedDate)}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 5: Resumes */}
          {activeTab === "resumes" && (
            <div className="space-y-3">
              {resumes.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-400">No resumes uploaded yet.</p>
              ) : (
                resumes.map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-xl border border-ink-100 bg-white p-3.5 shadow-xs">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-brand-600" />
                      <div>
                        <p className="font-semibold text-sm text-ink-900">{r.originalName || "Resume"}</p>
                        <p className="text-xs text-ink-500">
                          Version {r.version} · {r.processingStatus} · {formatDate(r.createdAt)}
                        </p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      leftIcon={<Download className="h-3.5 w-3.5" />}
                      isLoading={downloadingId === r.id}
                      onClick={() => handleDownloadResume(r.id, r.originalName)}
                    >
                      Download
                    </Button>
                  </div>
                ))
              )}
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-ink-100">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default Candidate360Drawer;
