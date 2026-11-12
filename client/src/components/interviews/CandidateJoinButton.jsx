import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Video } from "lucide-react";
import Button from "../ui/Button";
import { useToast } from "../ui/useToast";
import { interviewApi } from "../../lib/api";
import { candidateJoinInfo } from "../../lib/interviewWorkflow";
import { safeHttpUrl } from "../../lib/safeUrl";
import { openPreparedWindow, prepareWindow } from "./openMeeting";

/**
 * Candidate Join. Disabled until the server's joinState says the recruiter has started the interview. The link is
 * requested from the server at click time; it is never read from the interview record on the page.
 */
const CandidateJoinButton = ({ interview }) => {
  const toast = useToast();
  const [fallbackUrl, setFallbackUrl] = useState("");
  const info = candidateJoinInfo(interview);
  const id = interview._id || interview.id;

  const join = useMutation({
    mutationFn: (win) => interviewApi.join(id).then((res) => ({ res, win })),
    onSuccess: ({ res, win }) => {
      const url = res?.data?.url;
      if (openPreparedWindow(win, url)) return;
      setFallbackUrl(safeHttpUrl(url) || "");
      toast.error("Your browser blocked the new tab. Use the link below to join.");
    },
    onError: (error) => {
      toast.error(error.message || "You cannot join this interview yet.");
    },
  });

  return (
    <div className="flex flex-col gap-2" data-testid="candidate-join">
      <Button
        size="sm"
        leftIcon={<Video className="h-4 w-4" aria-hidden="true" />}
        disabled={!info.canJoin}
        isLoading={join.isPending}
        aria-describedby={`join-hint-${id}`}
        onClick={() => join.mutate(prepareWindow())}
      >
        Join interview
      </Button>
      <p id={`join-hint-${id}`} className="text-xs text-ink-500">
        {info.canJoin ? "Your recruiter has started the interview." : info.message}
      </p>
      {fallbackUrl && (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold text-brand-700 underline"
        >
          Open the interview link (opens in a new tab)
        </a>
      )}
    </div>
  );
};

export default CandidateJoinButton;
