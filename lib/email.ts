import { BriefingPayload } from "@/lib/types";
import { formatDisplayDate, formatLocalDateTime } from "@/lib/time";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderList(items: string[]) {
  if (items.length === 0) {
    return "<li>None noted.</li>";
  }

  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

export function buildEmailSubject(payload: BriefingPayload) {
  return `Morning Briefing: ${formatDisplayDate(
    payload.date,
    payload.metadata.timezone,
  )}`;
}

export function renderMorningBriefingEmail(payload: BriefingPayload) {
  const displayDate = formatDisplayDate(payload.date, payload.metadata.timezone);

  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6efe3;color:#1f2933;font-family:Georgia,serif;">
    <div style="max-width:760px;margin:0 auto;padding:28px 16px;">
      <div style="background:#fffdf7;border:1px solid #eadcc7;border-radius:24px;overflow:hidden;">
        <div style="padding:28px 28px 18px;background:linear-gradient(135deg,#f5ecdd 0%,#eef7f4 100%);border-bottom:1px solid #eadcc7;">
          <p style="margin:0 0 8px;color:#0f766e;text-transform:uppercase;letter-spacing:0.16em;font-size:12px;">AI Chief of Staff</p>
          <h1 style="margin:0;font-size:34px;line-height:1;">${escapeHtml(displayDate)}</h1>
          <p style="margin:16px 0 0;font-size:16px;line-height:1.6;color:#52606d;">${escapeHtml(payload.executiveSummary)}</p>
        </div>
        <div style="padding:24px 28px;">
          <h2 style="margin:0 0 10px;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;">Top Actions</h2>
          <ul style="margin:0 0 26px;padding-left:20px;line-height:1.7;color:#364152;">${renderList(payload.topActions)}</ul>
          <h2 style="margin:0 0 10px;font-size:16px;letter-spacing:0.08em;text-transform:uppercase;color:#b45309;">PM Synthesis</h2>
          <p style="margin:0 0 8px;font-weight:700;">Daily Priorities</p>
          <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(payload.pmSynthesis.dailyPriorities)}</ul>
          <p style="margin:0 0 8px;font-weight:700;">Cross-Meeting Risks</p>
          <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(payload.pmSynthesis.crossMeetingRisks)}</ul>
          <p style="margin:0 0 20px;font-weight:700;">Stakeholder Update Draft</p>
          <ul style="margin:0 0 26px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(payload.pmSynthesis.stakeholderUpdateDraft)}</ul>
          ${payload.meetings
            .map(
              (meeting) => `<section style="padding:20px 0;border-top:1px solid #efe7d9;">
            <h3 style="margin:0 0 6px;font-size:24px;line-height:1.15;">${escapeHtml(meeting.title)}</h3>
            <p style="margin:0 0 14px;color:#52606d;font-size:14px;">
              ${escapeHtml(formatLocalDateTime(meeting.start, payload.metadata.timezone))} to ${escapeHtml(formatLocalDateTime(meeting.end, payload.metadata.timezone))}
            </p>
            <p style="margin:0 0 14px;color:#1f2933;line-height:1.65;">${escapeHtml(meeting.summary)}</p>
            <p style="margin:0 0 10px;color:#0f766e;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;">Participants</p>
            <p style="margin:0 0 14px;color:#52606d;line-height:1.6;">${escapeHtml(meeting.participants.join(", ") || "No participants listed")}</p>
            <p style="margin:0 0 8px;font-weight:700;">Key Points</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.keyPoints)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">Prep Notes</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.prepNotes)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">Risks</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.risks)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">Action Items</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.actionItems)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">PM Synthesis: Talking Points</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.pmSynthesis.recommendedTalkingPoints)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">PM Synthesis: Decisions To Drive</p>
            <ul style="margin:0 0 14px;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.pmSynthesis.decisionsToDrive)}</ul>
            <p style="margin:0 0 8px;font-weight:700;">PM Synthesis: Stakeholder Signals</p>
            <ul style="margin:0;padding-left:20px;line-height:1.6;color:#364152;">${renderList(meeting.pmSynthesis.stakeholderSignals)}</ul>
          </section>`,
            )
            .join("")}
        </div>
      </div>
    </div>
  </body>
</html>`;

  const text = [
    `Morning Briefing - ${displayDate}`,
    "",
    payload.executiveSummary,
    "",
    "Top Actions",
    ...payload.topActions.map((item) => `- ${item}`),
    "",
    "PM Synthesis",
    "Daily Priorities:",
    ...payload.pmSynthesis.dailyPriorities.map((item) => `- ${item}`),
    "Cross-Meeting Risks:",
    ...payload.pmSynthesis.crossMeetingRisks.map((item) => `- ${item}`),
    "Stakeholder Update Draft:",
    ...payload.pmSynthesis.stakeholderUpdateDraft.map((item) => `- ${item}`),
    "",
    ...payload.meetings.flatMap((meeting) => [
      `${meeting.title} (${formatLocalDateTime(
        meeting.start,
        payload.metadata.timezone,
      )} to ${formatLocalDateTime(meeting.end, payload.metadata.timezone)})`,
      `Participants: ${meeting.participants.join(", ") || "No participants listed"}`,
      meeting.summary,
      "Key Points:",
      ...(meeting.keyPoints.length > 0 ? meeting.keyPoints.map((item) => `- ${item}`) : ["- None noted."]),
      "Prep Notes:",
      ...(meeting.prepNotes.length > 0 ? meeting.prepNotes.map((item) => `- ${item}`) : ["- None noted."]),
      "Risks:",
      ...(meeting.risks.length > 0 ? meeting.risks.map((item) => `- ${item}`) : ["- None noted."]),
      "Action Items:",
      ...(meeting.actionItems.length > 0 ? meeting.actionItems.map((item) => `- ${item}`) : ["- None noted."]),
      "PM Synthesis - Talking Points:",
      ...(meeting.pmSynthesis.recommendedTalkingPoints.length > 0
        ? meeting.pmSynthesis.recommendedTalkingPoints.map((item) => `- ${item}`)
        : ["- None noted."]),
      "PM Synthesis - Decisions To Drive:",
      ...(meeting.pmSynthesis.decisionsToDrive.length > 0
        ? meeting.pmSynthesis.decisionsToDrive.map((item) => `- ${item}`)
        : ["- None noted."]),
      "PM Synthesis - Stakeholder Signals:",
      ...(meeting.pmSynthesis.stakeholderSignals.length > 0
        ? meeting.pmSynthesis.stakeholderSignals.map((item) => `- ${item}`)
        : ["- None noted."]),
      "",
    ]),
  ].join("\n");

  return { html, text };
}
