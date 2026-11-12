// Read-only list of a candidate's resume files for platform admins (Requirement 9). The server audits each
// list and download. Shown only to platform admins, never to the company or other candidates.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import Button from "../ui/Button";
import Modal from "../ui/Modal";
import Badge from "../ui/Badge";
import { EmptyState, ErrorState, LoadingState } from "../ui/States";
import { adminApi } from "../../lib/api";
import { downloadBlob, formatDateTime } from "../../lib/utils";
import { useToast } from "../ui/useToast";

const kb = (bytes) => (bytes ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("en-IN")} KB` : "-");

export const CandidateResumesModal = ({ candidate, onClose }) => {
  const toast = useToast();
  const [downloading, setDownloading] = useState(null);
  const query = useQuery({
    queryKey: ["admin-candidate-resumes", candidate._id],
    queryFn: () => adminApi.candidateResumes(candidate._id),
  });
  const versions = query.data?.data || [];

  const download = async (version) => {
    setDownloading(version.id);
    try {
      const res = await adminApi.candidateResumeDownload(candidate._id, version.id);
      downloadBlob(res.data, version.originalName || "resume");
    } catch (err) {
      toast.error(err.message || "The resume could not be downloaded.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Resumes · ${candidate.name || candidate.email || "Candidate"}`}>
      <div className="space-y-4">
        <p className="rounded-lg bg-warning-50 p-3 text-xs text-warning-900">
          Viewing and downloading resumes is recorded in the audit log. Use it only for a platform review.
        </p>

        {query.isLoading ? (
          <LoadingState message="Loading resumes…" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={query.refetch} />
        ) : versions.length === 0 ? (
          <EmptyState title="No resumes uploaded" description="This candidate has not uploaded a resume." />
        ) : (
          <ul className="divide-y divide-ink-100" aria-label="Resume versions">
            {versions.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-900">{v.originalName}</p>
                  <p className="text-xs text-ink-500">
                    Version {v.version} · {formatDateTime(v.createdAt)} · {kb(v.size)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={v.processingStatus === "ready" ? "success" : "default"}>{v.processingStatus}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={downloading === v.id}
                    onClick={() => download(v)}
                    aria-label={`Download ${v.originalName}`}
                  >
                    Download
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
};

export default CandidateResumesModal;
