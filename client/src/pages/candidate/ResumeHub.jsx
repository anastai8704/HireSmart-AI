/**
 * candidate/ResumeHub.jsx
 * -----------------------------------------------------------------------------
 * Upload, replace, download and analyse the candidate's resume.
 *
 * The upload area supports drag-and-drop as well as a file picker, and
 * validates type and size in the browser before sending anything - failing
 * instantly is far better than uploading 20 MB only to be rejected.
 */

import { useRef, useState } from "react";
import {
    Download,
    FileText,
    Sparkles,
    Trash2,
    UploadCloud,
} from "lucide-react";

import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import ResumeReport from "../../components/ai/ResumeReport";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import { EmptyState, InlineError, LoadingState } from "../../components/ui/States";
import { aiApi, authApi } from "../../lib/api";
import { cn, downloadBlob, formatBytes, formatDate } from "../../lib/utils";
import { useAuth } from "../../context/useAuth";
import { useMutation } from "../../hooks/useApi";
import { useToast } from "../../components/ui/useToast";

/** Mirrors the limits enforced by the server's multer configuration. */
const ACCEPTED_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const ACCEPTED_EXTENSIONS = [".pdf", ".doc", ".docx"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const ResumeHub = () => {
    const { user, refresh } = useAuth();
    const toast = useToast();

    const fileInputRef = useRef(null);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [validationError, setValidationError] = useState(null);
    const [showDelete, setShowDelete] = useState(false);

    const hasResume = Boolean(user?.resume);

    const { mutate: upload, isLoading: isUploading, error: uploadError } = useMutation(
        (file) =>
            authApi.uploadResume(file, (event) => {
                if (event.total) {
                    setUploadProgress(Math.round((event.loaded * 100) / event.total));
                }
            })
    );

    const { mutate: removeResume, isLoading: isDeleting } = useMutation(authApi.deleteResume);

    const {
        mutate: analyse,
        data: analysisData,
        isLoading: isAnalysing,
        error: analysisError,
        reset: resetAnalysis,
    } = useMutation(aiApi.resumeAnalysis);

    /** Client-side checks so obvious mistakes never reach the network. */
    const validateFile = (file) => {
        const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

        if (!ACCEPTED_TYPES.includes(file.type) && !ACCEPTED_EXTENSIONS.includes(extension)) {
            return "Only PDF, DOC and DOCX files are accepted.";
        }

        if (file.size > MAX_SIZE_BYTES) {
            return `That file is ${formatBytes(file.size)}. The maximum size is 5 MB.`;
        }

        return null;
    };

    const handleFile = async (file) => {
        if (!file) return;

        const problem = validateFile(file);

        if (problem) {
            setValidationError({ message: problem });
            return;
        }

        setValidationError(null);
        setUploadProgress(0);

        try {
            await upload(file);
            await refresh();
            resetAnalysis();
            toast.success("Resume uploaded successfully");
        } catch (caught) {
            toast.error(caught.message);
        } finally {
            setUploadProgress(0);
        }
    };

    const handleDrop = (event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFile(event.dataTransfer.files?.[0]);
    };

    const handleDelete = async () => {
        try {
            await removeResume();
            await refresh();
            resetAnalysis();
            setShowDelete(false);
            toast.success("Resume deleted");
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleDownload = async () => {
        try {
            const blob = await authApi.downloadResume();
            downloadBlob(blob, user?.resume?.originalName || "resume.pdf");
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const handleAnalyse = async () => {
        try {
            await analyse();
        } catch (caught) {
            toast.error(caught.message);
        }
    };

    const report = analysisData?.data;

    return (
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-ink-900">My resume</h1>
                <p className="mt-1.5 text-ink-500">
                    Upload once. We use it for applications, matching and your ATS score.
                </p>
            </header>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* ---------- Upload / current file ---------- */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {hasResume ? "Current resume" : "Upload your resume"}
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {(validationError || uploadError) && (
                                <InlineError error={validationError || uploadError} />
                            )}

                            {hasResume && (
                                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 bg-ink-50 p-4">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                                        <FileText className="h-5 w-5" aria-hidden="true" />
                                    </span>

                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium text-ink-900">
                                            {user.resume.originalName}
                                        </p>

                                        <p className="text-xs text-ink-500">
                                            {formatBytes(user.resume.size)} - uploaded{" "}
                                            {formatDate(user.resume.uploadedAt)}
                                        </p>
                                    </div>

                                    <div className="flex gap-2">
                                        <Button
                                            variant="secondary"
                                            size="sm"
                                            onClick={handleDownload}
                                            leftIcon={<Download className="h-3.5 w-3.5" />}
                                        >
                                            Download
                                        </Button>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setShowDelete(true)}
                                            leftIcon={
                                                <Trash2 className="h-3.5 w-3.5 text-danger-500" />
                                            }
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Drag-and-drop zone.
                                It is a <button> so keyboard users can trigger it too. */}
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={handleDrop}
                                disabled={isUploading}
                                className={cn(
                                    "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
                                    isDragging
                                        ? "border-brand-500 bg-brand-50"
                                        : "border-ink-300 bg-white hover:border-brand-300 hover:bg-ink-50",
                                    isUploading && "cursor-wait opacity-60"
                                )}
                            >
                                <UploadCloud
                                    className={cn(
                                        "h-9 w-9",
                                        isDragging ? "text-brand-500" : "text-ink-400"
                                    )}
                                    aria-hidden="true"
                                />

                                <p className="text-sm font-medium text-ink-700">
                                    {hasResume
                                        ? "Drop a new file here to replace it"
                                        : "Drop your resume here, or click to browse"}
                                </p>

                                <p className="text-xs text-ink-400">
                                    PDF, DOC or DOCX - maximum 5 MB
                                </p>

                                {isUploading && uploadProgress > 0 && (
                                    <div className="mt-2 w-full max-w-xs">
                                        <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
                                            <div
                                                className="h-full rounded-full bg-brand-500 transition-all"
                                                style={{ width: `${uploadProgress}%` }}
                                            />
                                        </div>

                                        <p className="mt-1 text-center text-xs text-ink-500">
                                            Uploading {uploadProgress}%
                                        </p>
                                    </div>
                                )}
                            </button>

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept={ACCEPTED_EXTENSIONS.join(",")}
                                className="hidden"
                                onChange={(event) => {
                                    handleFile(event.target.files?.[0]);
                                    // Reset so selecting the SAME file again still fires onChange.
                                    event.target.value = "";
                                }}
                            />
                        </CardContent>
                    </Card>
                </div>

                {/* ---------- Analyse ---------- */}
                <aside>
                    <Card className="lg:sticky lg:top-20">
                        <CardHeader>
                            <CardTitle>ATS analysis</CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-3">
                            <p className="text-sm text-ink-500">
                                See how an applicant tracking system reads your resume, and exactly
                                what to fix.
                            </p>

                            <Button
                                fullWidth
                                disabled={!hasResume}
                                isLoading={isAnalysing}
                                onClick={handleAnalyse}
                                leftIcon={<Sparkles className="h-4 w-4" />}
                            >
                                {report ? "Re-run analysis" : "Analyse my resume"}
                            </Button>

                            {!hasResume && (
                                <p className="text-xs text-ink-400">
                                    Upload a resume first to enable this.
                                </p>
                            )}

                            {analysisError && <InlineError error={analysisError} />}
                        </CardContent>
                    </Card>
                </aside>
            </div>

            {/* ---------- Report ---------- */}
            <div className="mt-8">
                {isAnalysing ? (
                    <LoadingState message="Analysing your resume..." />
                ) : report ? (
                    <div className="animate-[fade-up_0.4s_ease-out_both]">
                        <ResumeReport report={report} />
                    </div>
                ) : (
                    hasResume && (
                        <EmptyState
                            icon={Sparkles}
                            title="No analysis yet"
                            description="Run the ATS analysis to get your score and a prioritised list of improvements."
                            action={
                                <Button
                                    size="sm"
                                    onClick={handleAnalyse}
                                    leftIcon={<Sparkles className="h-3.5 w-3.5" />}
                                >
                                    Analyse now
                                </Button>
                            }
                        />
                    )
                )}
            </div>

            <Modal
                isOpen={showDelete}
                onClose={() => setShowDelete(false)}
                title="Delete your resume?"
                description="You will not be able to apply to jobs until you upload another one."
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setShowDelete(false)}>
                            Cancel
                        </Button>

                        <Button variant="danger" isLoading={isDeleting} onClick={handleDelete}>
                            Delete resume
                        </Button>
                    </>
                }
            >
                <p className="text-sm text-ink-600">
                    Resumes already submitted with past applications are kept by those recruiters -
                    this only removes the copy on your profile.
                </p>
            </Modal>
        </div>
    );
};

export default ResumeHub;
