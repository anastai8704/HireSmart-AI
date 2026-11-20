/* eslint-disable react-refresh/only-export-components */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Download,
  Video,
  Sparkles,
  Award,
  ArrowLeft,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Input, { Textarea } from "../../components/ui/Input";
import { StatusPill } from "../../components/Product";
import { LoadingState, ErrorState } from "../../components/ui/States";
import { useToast } from "../../components/ui/useToast";
import { formatDate, formatDateTime, formatRelativeTime, initials, cn } from "../../lib/utils";
import * as api from "../../lib/api";

const getRecruitmentApi = () => {
  try {
    return api.recruitmentApi || {};
  } catch {
    return {};
  }
};

const getInterviewApi = () => {
  try {
    return api.interviewApi || {};
  } catch {
    return {};
  }
};

export const PERMITTED_TRANSITIONS = {
  submitted: ["under_review", "shortlisted", "rejected"],
  Applied: ["under_review", "shortlisted", "rejected"],
  under_review: ["shortlisted", "interview", "rejected"],
  shortlisted: ["interview", "rejected"],
  interview: ["offer", "rejected"],
  offer: ["hired", "rejected"],
  hired: [],
  Selected: [],
  rejected: [],
  Rejected: [],
  withdrawn: [],
  Withdrawn: [],
  closed: [],
};

export const STAGE_LABELS = {
  submitted: "Submitted",
  Applied: "Submitted",
  under_review: "Under Review",
  review: "Under Review",
  shortlist: "Shortlist",
  shortlisted: "Shortlisted",
  Shortlisted: "Shortlisted",
  interview: "Interview",
  Interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  Selected: "Hired",
  reject: "Reject",
  rejected: "Rejected",
  Rejected: "Rejected",
  withdrawn: "Withdrawn",
  Withdrawn: "Withdrawn",
  closed: "Closed",
};

export const Candidate360Drawer = ({ applicationId, orgId, onClose, onStatusChange }) => {
  const toast = useToast();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("overview");
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteVisibility, setNewNoteVisibility] = useState("hiring_team");
  const [isDownloadingResume, setIsDownloadingResume] = useState(false);
  const [offerData, setOfferData] = useState({
    designation: "",
    ctc: "",
    joiningDate: "",
    note: "",
  });

  // Queries
  const detailQuery = useQuery({
    queryKey: ["application-detail", orgId, applicationId],
    queryFn: () => getRecruitmentApi().detail(orgId, applicationId),
    enabled: Boolean(orgId && applicationId),
  });

  const notesQuery = useQuery({
    queryKey: ["application-notes", orgId, applicationId],
    queryFn: () => {
      const rApi = getRecruitmentApi();
      return rApi.notes ? rApi.notes(orgId, applicationId) : Promise.resolve({ data: [] });
    },
    enabled: Boolean(orgId && applicationId),
  });

  const matchQuery = useQuery({
    queryKey: ["application-match", orgId, applicationId],
    queryFn: () => {
      const rApi = getRecruitmentApi();
      return rApi.match ? rApi.match(orgId, applicationId) : Promise.resolve({ data: null });
    },
    enabled: Boolean(orgId && applicationId),
  });

  const appData = detailQuery.data?.data?.application || detailQuery.data?.data || {};
  const candidate = appData.candidate || {};
  const job = appData.job || {};
  const resumeSnapshot = appData.resumeSnapshot || {};
  const match = matchQuery.data?.data || detailQuery.data?.data?.match;
  const statusHistory = appData.statusHistory || [];
  const offer = appData.offer || {};
  const currentStatus = appData.status || "submitted";

  const interviewsQuery = useQuery({
    queryKey: ["candidate-interviews", orgId, candidate._id || candidate.id],
    queryFn: () => {
      const cId = candidate._id || candidate.id;
      const iApi = getInterviewApi();
      return iApi.list ? iApi.list(orgId, { candidateId: cId }) : Promise.resolve({ data: [] });
    },
    enabled: Boolean(orgId && (candidate._id || candidate.id)),
  });

  const interviews = interviewsQuery.data?.data || [];

  // Mutations
  const transitionMutation = useMutation({
    mutationFn: async ({ toStatus, note }) => {
      if (toStatus === "offer") {
        setActiveTab("offer");
        return;
      }
      return getRecruitmentApi().transition(orgId, applicationId, {
        toStatus,
        note: note || `Moved to ${STAGE_LABELS[toStatus] || toStatus}`,
      });
    },
    onSuccess: (res, vars) => {
      if (vars.toStatus === "offer") return;
      toast.success(`Application moved to ${STAGE_LABELS[vars.toStatus] || vars.toStatus}`);
      setTransitionTarget(null);
      setTransitionNote("");
      qc.invalidateQueries({ queryKey: ["application-detail", orgId, applicationId] });
      qc.invalidateQueries({ queryKey: ["applications-job", orgId] });
      qc.invalidateQueries({ queryKey: ["recruiter-applications", orgId] });
      onStatusChange?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update candidate stage");
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: () =>
      getRecruitmentApi().addNote(orgId, applicationId, {
        body: newNoteBody.trim(),
        visibility: newNoteVisibility,
        tags: [],
      }),
    onSuccess: () => {
      toast.success("Recruiter note added");
      setNewNoteBody("");
      qc.invalidateQueries({ queryKey: ["application-notes", orgId, applicationId] });
    },
    onError: (err) => {
      toast.error(err.message || "Failed to add note");
    },
  });

  const issueOfferMutation = useMutation({
    mutationFn: () => {
      const ctcVal = Number(String(offerData.ctc).replace(/\D/g, "")) || 0;
      return getRecruitmentApi().issueOffer(orgId, applicationId, {
        designation: offerData.designation.trim() || job.title,
        ctc: ctcVal,
        currency: "INR",
        joiningDate: offerData.joiningDate || undefined,
        note: offerData.note.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Offer successfully issued to candidate");
      qc.invalidateQueries({ queryKey: ["application-detail", orgId, applicationId] });
      qc.invalidateQueries({ queryKey: ["applications-job", orgId] });
      onStatusChange?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to issue offer");
    },
  });

  const handleDownloadResume = async () => {
    setIsDownloadingResume(true);
    try {
      const res = await getRecruitmentApi().resume(orgId, applicationId);
      const blob = res instanceof Blob ? res : (res?.data || res);
      if (!blob || !(blob instanceof Blob)) {
        throw new Error("Candidate resume file is unavailable");
      }
      if (api.downloadBlob) {
        api.downloadBlob(blob, resumeSnapshot.originalName || `${candidate.name || "candidate"}-resume.pdf`);
      }
      toast.success("Resume downloaded successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Unable to download candidate resume");
    } finally {
      setIsDownloadingResume(false);
    }
  };

  const withdrawOfferMutation = useMutation({
    mutationFn: (reason = "Withdrawn by hiring team") =>
      getRecruitmentApi().withdrawOffer(orgId, applicationId, reason),
    onSuccess: () => {
      toast.success("Offer successfully withdrawn");
      qc.invalidateQueries({ queryKey: ["application-detail", orgId, applicationId] });
      qc.invalidateQueries({ queryKey: ["applications-job", orgId] });
      onStatusChange?.();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to withdraw offer");
    },
  });

  const allowedTransitions = PERMITTED_TRANSITIONS[currentStatus] || [];
  const notesList = notesQuery.data?.data || [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 backdrop-blur-xs transition-opacity"
      data-testid="candidate-360-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="candidate-360-title"
    >
      <div className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-200">
        {/* Top Drawer Header */}
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">
              {initials(candidate.name || "Candidate")}
            </span>
            <div className="min-w-0">
              <h2 id="candidate-360-title" className="text-lg font-bold text-ink-950 truncate">
                {candidate.name || "Candidate Profile"}
              </h2>
              <div className="flex items-center gap-2 text-xs text-ink-500">
                <span className="truncate">{job.title || "Requisition"}</span>
                <span>•</span>
                <StatusPill status={currentStatus} />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 shadow-2xs hover:bg-ink-50 hover:text-ink-950 transition-colors"
              aria-label="Back to pipeline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Pipeline</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              aria-label="Close candidate drawer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-ink-100 px-6 bg-ink-50/50" role="tablist">
          {[
            { id: "overview", label: "Overview" },
            { id: "pipeline", label: "Pipeline & Stages" },
            { id: "resume", label: "Resume" },
            { id: "interviews", label: `Interviews (${interviews.length})` },
            { id: "notes", label: `Notes (${notesList.length})` },
            { id: "offer", label: "Offer" },
          ].map((tab) => (
            <button
              key={tab.id}
              role="tab"
              data-testid={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "relative py-3 px-3 text-xs font-semibold transition-colors whitespace-nowrap",
                activeTab === tab.id
                  ? "text-brand-600 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-brand-600"
                  : "text-ink-500 hover:text-ink-900",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Drawer Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {detailQuery.isLoading ? (
            <LoadingState message="Loading candidate 360 profile..." />
          ) : detailQuery.error ? (
            <ErrorState error={detailQuery.error} />
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {/* Basic Details Card */}
                  <div className="panel p-5 space-y-4">
                    <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Candidate Contact & Overview</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="flex items-center gap-2 text-ink-700">
                        <Mail className="h-4 w-4 text-ink-400 shrink-0" />
                        <span className="truncate">{candidate.email || "No email on record"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-ink-700">
                        <Phone className="h-4 w-4 text-ink-400 shrink-0" />
                        <span>{candidate.phone || "No phone provided"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-ink-700">
                        <MapPin className="h-4 w-4 text-ink-400 shrink-0" />
                        <span>{candidate.location || "Location unspecified"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-ink-700">
                        <Calendar className="h-4 w-4 text-ink-400 shrink-0" />
                        <span>Applied {formatDate(appData.appliedAt || appData.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* AI Fit Analysis */}
                  {match && (
                    <div className="panel p-5 space-y-3 bg-brand-50/20 border-brand-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-brand-600" />
                          <h3 className="text-sm font-bold text-ink-900">AI Requisition Fit Score</h3>
                        </div>
                        <span className="rounded-full bg-brand-100 px-3 py-1 text-sm font-bold text-brand-800">
                          {match.overallScore ?? match.score ?? 0}% Match
                        </span>
                      </div>
                      {match.summary && (
                        <p className="text-xs text-ink-700 leading-relaxed">{match.summary}</p>
                      )}
                    </div>
                  )}

                  {/* Skills Grid */}
                  <div className="panel p-5 space-y-3">
                    <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Identified Skills</h3>
                    {candidate.skills && candidate.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {candidate.skills.map((skill, sIdx) => (
                          <span
                            key={sIdx}
                            className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-800"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-500 italic">No skills listed on this candidate profile.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: PIPELINE & STAGES */}
              {activeTab === "pipeline" && (
                <div className="space-y-6">
                  {/* Stage Transition Control */}
                  <div className="panel p-5 space-y-4">
                    <h3 className="text-sm font-bold text-ink-900">Current Stage & Actions</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-ink-500">Current Stage:</span>
                        <StatusPill status={currentStatus} />
                      </div>
                    </div>

                    {allowedTransitions.length > 0 ? (
                      <div className="space-y-3 pt-2 border-t border-ink-100">
                        <p className="text-xs font-semibold text-ink-700">Permitted Next Transitions:</p>
                        <div className="flex flex-wrap gap-2">
                          {allowedTransitions.map((target) => (
                            <Button
                              key={target}
                              size="sm"
                              variant={target === "rejected" ? "outline" : "secondary"}
                              className={target === "rejected" ? "text-danger-600 hover:bg-danger-50" : ""}
                              onClick={() => {
                                if (target === "offer") {
                                  setActiveTab("offer");
                                } else {
                                  setTransitionTarget(target);
                                }
                              }}
                            >
                              Transition to {STAGE_LABELS[target] || target}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-ink-500 italic">No further stage transitions permitted from this state.</p>
                    )}

                    {/* Transition Confirmation Input */}
                    {transitionTarget && (
                      <div className="rounded-xl border border-brand-200 bg-brand-50/30 p-4 space-y-3">
                        <h4 className="text-xs font-bold text-brand-900">
                          Confirm move to {STAGE_LABELS[transitionTarget] || transitionTarget}
                        </h4>
                        <Input
                          label="Stage Transition Note (Optional)"
                          placeholder="e.g. Cleared technical screening interview with high score"
                          value={transitionNote}
                          onChange={(e) => setTransitionNote(e.target.value)}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            isLoading={transitionMutation.isPending}
                            onClick={() =>
                              transitionMutation.mutate({
                                toStatus: transitionTarget,
                                note: transitionNote,
                              })
                            }
                          >
                            Confirm Transition
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setTransitionTarget(null);
                              setTransitionNote("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stage Timeline */}
                  <div className="panel p-5 space-y-4">
                    <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Transition History Timeline</h3>
                    {statusHistory.length > 0 ? (
                      <div className="relative border-l-2 border-ink-100 ml-3 space-y-5 py-1">
                        {statusHistory.map((hist, idx) => (
                          <div key={idx} className="relative pl-6">
                            <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-white bg-brand-600" />
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <p className="text-sm font-semibold text-ink-900">
                                {STAGE_LABELS[hist.status] || hist.status}
                              </p>
                              <span className="text-xs text-ink-400">
                                {hist.changedAt ? formatDateTime(hist.changedAt) : ""}
                              </span>
                            </div>
                            {hist.note && <p className="mt-1 text-xs text-ink-600 bg-ink-50 p-2 rounded-lg">{hist.note}</p>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs italic text-ink-400">Initial submission record created.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: RESUME */}
              {activeTab === "resume" && (
                <div className="space-y-6">
                  <div className="panel p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-ink-100 pb-3">
                      <div>
                        <h3 className="text-sm font-bold text-ink-900">Submitted Resume Document</h3>
                        <p className="text-xs text-ink-500">
                          {resumeSnapshot.originalName || "candidate_resume.pdf"}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        leftIcon={<Download className="h-4 w-4" />}
                        isLoading={isDownloadingResume}
                        onClick={handleDownloadResume}
                        data-testid="drawer-download-resume-btn"
                      >
                        Download Resume
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs text-ink-600">
                      <div>
                        <span className="font-semibold text-ink-900">File Type: </span>
                        <span>PDF / Document</span>
                      </div>
                      <div>
                        <span className="font-semibold text-ink-900">Uploaded: </span>
                        <span>{formatDate(appData.appliedAt || appData.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: INTERVIEWS */}
              {activeTab === "interviews" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-ink-900 uppercase tracking-wider">Candidate Interview Schedule</h3>
                  </div>

                  {interviews.length > 0 ? (
                    <div className="space-y-3">
                      {interviews.map((iv) => (
                        <div key={iv._id || iv.id} className="panel p-4 flex items-center justify-between">
                          <div className="flex items-start gap-3">
                            <span className="p-2 rounded-lg bg-brand-50 text-brand-600">
                              <Video className="h-4 w-4" />
                            </span>
                            <div>
                              <h4 className="text-sm font-bold text-ink-900">{iv.title || "Interview Session"}</h4>
                              <p className="text-xs text-ink-500">
                                {iv.scheduledAt ? formatDateTime(iv.scheduledAt) : "Date to be scheduled"}
                              </p>
                            </div>
                          </div>
                          <Badge variant={iv.status === "completed" ? "success" : "neutral"}>
                            {iv.status || "Scheduled"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="panel p-8 text-center">
                      <p className="text-xs text-ink-500">No interviews currently scheduled for this candidate.</p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: NOTES & SCORECARDS */}
              {activeTab === "notes" && (
                <div className="space-y-6">
                  {/* Add Note Card */}
                  <div className="panel p-5 space-y-3">
                    <h3 className="text-sm font-bold text-ink-900">Add Evaluation Note</h3>
                    <Textarea
                      rows={3}
                      placeholder="Write feedback, observations, or scorecard evaluation..."
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                    />
                    <div className="flex items-center justify-between pt-2">
                      <select
                        value={newNoteVisibility}
                        onChange={(e) => setNewNoteVisibility(e.target.value)}
                        className="rounded border border-ink-200 text-xs px-2 py-1 text-ink-700"
                      >
                        <option value="hiring_team">Hiring Team Only</option>
                        <option value="private">Private (Only Me)</option>
                      </select>
                      <Button
                        size="sm"
                        disabled={!newNoteBody.trim()}
                        isLoading={addNoteMutation.isPending}
                        onClick={() => addNoteMutation.mutate()}
                      >
                        Post Note
                      </Button>
                    </div>
                  </div>

                  {/* Existing Notes Feed */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-500">
                      Team Feedback ({notesList.length})
                    </h4>
                    {notesList.length > 0 ? (
                      notesList.map((n) => (
                        <div key={n._id || n.id} className="panel p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-ink-900">{n.author?.name || "Recruiter"}</span>
                            <span className="text-[11px] text-ink-400">
                              {n.createdAt ? formatRelativeTime(n.createdAt) : ""}
                            </span>
                          </div>
                          <p className="text-sm text-ink-800 whitespace-pre-wrap">{n.body}</p>
                          <Badge variant="neutral" className="text-[10px] capitalize">
                            {(n.visibility || "hiring_team").replace("_", " ")}
                          </Badge>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs italic text-ink-400">No notes recorded yet for this candidate.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 6: OFFER */}
              {activeTab === "offer" && (
                <div className="space-y-6">
                  {offer.status && !["none", "declined", "withdrawn", "expired"].includes(offer.status) ? (
                    <div className="panel p-5 space-y-4 border-emerald-200 bg-emerald-50/20">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Award className="h-5 w-5 text-emerald-600" />
                          <h3 className="text-base font-bold text-emerald-950">Active Job Offer</h3>
                        </div>
                        <Badge variant={offer.status === "accepted" ? "success" : offer.status === "declined" ? "danger" : "warning"}>
                          Offer {offer.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm pt-2">
                        <div>
                          <p className="text-xs text-ink-400">Designation</p>
                          <p className="font-semibold text-ink-900">{offer.designation || job.title}</p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-400">Offered CTC / Year</p>
                          <p className="font-semibold text-ink-900">
                            {offer.ctc ? `₹${offer.ctc.toLocaleString("en-IN")}` : "Competitive"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-400">Expected Joining Date</p>
                          <p className="font-semibold text-ink-900">
                            {offer.joiningDate ? formatDate(offer.joiningDate) : "TBD"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-ink-400">Offer Issued Date</p>
                          <p className="font-semibold text-ink-900">
                            {offer.issuedAt ? formatDate(offer.issuedAt) : "Recently"}
                          </p>
                        </div>
                      </div>

                      {offer.responseNote && (
                        <div className="rounded-lg bg-white p-3 text-xs text-ink-700">
                          <span className="font-semibold">Candidate response note:</span> {offer.responseNote}
                        </div>
                      )}

                      {offer.status === "issued" && (
                        <div className="pt-2 flex justify-end">
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 border-danger-200"
                            isLoading={withdrawOfferMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Are you sure you want to withdraw this issued offer?")) {
                                withdrawOfferMutation.mutate();
                              }
                            }}
                          >
                            Withdraw Offer
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="panel p-5 space-y-4">
                      {["declined", "withdrawn", "expired"].includes(offer.status) && (
                        <div className="rounded-lg bg-ink-100 p-3 text-xs text-ink-700 mb-2">
                          <span className="font-semibold capitalize">Previous offer was {offer.status}</span>
                          {offer.respondedAt && ` on ${formatDate(offer.respondedAt)}`}
                          {offer.responseNote && ` ("${offer.responseNote}")`}
                          . You can issue a revised offer below.
                        </div>
                      )}
                      <h3 className="text-base font-bold text-ink-900">
                        {["declined", "withdrawn", "expired"].includes(offer.status) ? "Issue Revised Offer" : "Issue Job Offer"}
                      </h3>
                      <p className="text-xs text-ink-500">
                        Formal employment offers can be extended once the candidate reaches the interview or offer stage.
                      </p>

                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          issueOfferMutation.mutate();
                        }}
                        className="space-y-4"
                      >
                        <Input
                          label="Designation / Offer Title"
                          placeholder={job.title || "e.g. Senior Frontend Engineer"}
                          value={offerData.designation}
                          onChange={(e) => setOfferData((prev) => ({ ...prev, designation: e.target.value }))}
                        />

                        <Input
                          label="Annual CTC (₹ INR)"
                          placeholder="e.g. 24,00,000"
                          value={offerData.ctc}
                          onChange={(e) => {
                            const digits = String(e.target.value).replace(/\D/g, "");
                            setOfferData((prev) => ({
                              ...prev,
                              ctc: digits ? Number(digits).toLocaleString("en-IN") : "",
                            }));
                          }}
                        />

                        <Input
                          type="date"
                          label="Expected Joining Date"
                          value={offerData.joiningDate}
                          onChange={(e) => setOfferData((prev) => ({ ...prev, joiningDate: e.target.value }))}
                        />

                        <Textarea
                          label="Additional Offer Notes"
                          rows={2}
                          placeholder="Special terms, sign-on bonus, or benefits information..."
                          value={offerData.note}
                          onChange={(e) => setOfferData((prev) => ({ ...prev, note: e.target.value }))}
                        />

                        <Button type="submit" isLoading={issueOfferMutation.isPending}>
                          Issue Formal Offer
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
