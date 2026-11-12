import { useState } from "react";
import Button from "../ui/Button";
import { formatDate as formatDateOnly } from "../../lib/utils";
import Input, { Textarea } from "../ui/Input";

/*
 * Offer panels for the recruiter and candidate application views (Phase 4).
 * The server is the source of truth: these panels only show the actions the server would accept,
 * and they never record acceptance on the candidate's behalf. "Issued" means the company sent the
 * offer; "accepted" means the candidate answered it; hiring needs "accepted".
 */

const formatDate = (value) => (value ? formatDateOnly(value) : "");

const offerOf = (application) => application?.offer || { status: "none" };

export const RecruiterOfferPanel = ({ application, onIssue, onHire, pending = false }) => {
  const [designation, setDesignation] = useState("");
  const [ctc, setCtc] = useState("");
  const [joiningDate, setJoiningDate] = useState("");
  const [note, setNote] = useState("");
  const offer = offerOf(application);
  const stage = application?.status;

  if (!["interview", "offer"].includes(stage)) return null;

  if (stage === "offer" && offer.status === "issued") {
    return (
      <section aria-label="Offer" className="space-y-2 rounded-xl border border-ink-100 p-4">
        <h3 className="font-semibold">Offer issued</h3>
        <p className="text-sm text-ink-600">
          {offer.designation || "Offer"}
          {offer.issuedAt ? ` · sent ${formatDate(offer.issuedAt)}` : ""}. Awaiting the candidate's response.
        </p>
      </section>
    );
  }

  if (stage === "offer" && offer.status === "accepted") {
    return (
      <section aria-label="Offer" className="space-y-2 rounded-xl border border-success-100 bg-success-50 p-4">
        <h3 className="font-semibold">Offer accepted by the candidate</h3>
        <p className="text-sm text-ink-600">
          Accepted {formatDate(offer.respondedAt)}. Hiring is recorded once you confirm the decision.
        </p>
        <Button fullWidth variant="primary" disabled={pending} onClick={() => onHire && onHire()}>
          Mark as Hired
        </Button>
      </section>
    );
  }

  // Interview stage, or the offer stage after a decline: a new offer may be issued.
  return (
    <form
      aria-label="Issue offer"
      className="space-y-3 rounded-xl border border-ink-100 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const body = { note: note.trim() || undefined };
        if (designation.trim()) body.designation = designation.trim();
        if (ctc !== "") body.ctc = Number(ctc);
        if (joiningDate) body.joiningDate = joiningDate;
        onIssue && onIssue(body);
      }}
    >
      <h3 className="font-semibold">{offer.status === "declined" ? "Issue a new offer" : "Issue an offer"}</h3>
      {offer.status === "declined" && (
        <p className="text-sm text-ink-600">The candidate declined the previous offer{offer.responseNote ? `: “${offer.responseNote}”` : "."}</p>
      )}
      <Input label="Designation" placeholder="Defaults to the job title" value={designation} onChange={(e) => setDesignation(e.target.value)} />
      <Input label="CTC (annual, INR)" type="number" min="0" value={ctc} onChange={(e) => setCtc(e.target.value)} hint="Leave empty if not agreed yet. It is not filled in for you." />
      <Input label="Proposed joining date" type="date" value={joiningDate} onChange={(e) => setJoiningDate(e.target.value)} />
      <Textarea label="Note for the record" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button type="submit" variant="primary" fullWidth disabled={pending}>
        Issue offer
      </Button>
      <p className="text-xs text-ink-400">Issuing an offer does not hire the candidate. Hiring needs the candidate's acceptance.</p>
    </form>
  );
};

export const CandidateOfferPanel = ({ application, onRespond, pending = false }) => {
  const [note, setNote] = useState("");
  const offer = offerOf(application);
  if (offer.status === "none" || !offer.status) return null;

  if (offer.status === "issued") {
    return (
      <section aria-label="Your offer" className="space-y-3 rounded-xl border border-brand-100 bg-brand-50 p-4">
        <h3 className="font-semibold">You have an offer</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {offer.designation && (
            <div>
              <dt className="text-ink-500">Designation</dt>
              <dd className="font-medium">{offer.designation}</dd>
            </div>
          )}
          {offer.ctc !== null && offer.ctc !== undefined && (
            <div>
              <dt className="text-ink-500">CTC</dt>
              <dd className="font-medium">₹{Number(offer.ctc).toLocaleString("en-IN")} per year</dd>
            </div>
          )}
          {offer.joiningDate && (
            <div>
              <dt className="text-ink-500">Proposed joining date</dt>
              <dd className="font-medium">{formatDate(offer.joiningDate)}</dd>
            </div>
          )}
        </dl>
        <Textarea label="Message to the company (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex flex-wrap gap-2">
          <Button variant="success" disabled={pending} onClick={() => onRespond && onRespond({ response: "accept", note: note.trim() || undefined })}>
            Accept offer
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => onRespond && onRespond({ response: "decline", note: note.trim() || undefined })}>
            Decline offer
          </Button>
        </div>
      </section>
    );
  }

  if (offer.status === "accepted") {
    return (
      <section aria-label="Your offer" className="rounded-xl border border-success-100 bg-success-50 p-4 text-sm">
        <h3 className="font-semibold">You accepted this offer</h3>
        <p className="mt-1 text-ink-600">Accepted {formatDate(offer.respondedAt)}. The company records the hire separately.</p>
      </section>
    );
  }

  return (
    <section aria-label="Your offer" className="rounded-xl border border-ink-100 p-4 text-sm">
      <h3 className="font-semibold">You declined this offer</h3>
      <p className="mt-1 text-ink-600">Declined {formatDate(offer.respondedAt)}.</p>
    </section>
  );
};

export default RecruiterOfferPanel;
