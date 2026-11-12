import { formatInZone, historyEvents } from "../../lib/interviewWorkflow";

/** Timeline from record timestamps. Labelled as derived because interviews do not yet keep a full event log. */
const InterviewHistory = ({ interview }) => {
  const events = historyEvents(interview);
  return (
    <section aria-labelledby="interview-history-heading" className="space-y-2">
      <h3 id="interview-history-heading" className="text-sm font-bold text-ink-950">
        History
      </h3>
      <p className="text-xs text-ink-500">Built from the interview record&apos;s timestamps.</p>
      {events.length === 0 ? (
        <p className="text-xs text-ink-500">No history yet.</p>
      ) : (
        <ol className="space-y-2 border-l border-ink-200 pl-4">
          {events.map((event, index) => (
            <li key={`${event.label}-${index}`} className="text-xs">
              <p className="font-semibold text-ink-900">{event.label}</p>
              <p className="text-ink-500">{formatInZone(event.at, interview.timezone)}</p>
              {event.detail && <p className="text-ink-600">{event.detail}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

export default InterviewHistory;
