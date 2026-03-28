import { getAppConfig } from "@/lib/config";
import {
  createActionProposalsIfMissing,
  createAgentTasksIfMissing,
  upsertMeetingSnapshots,
} from "@/lib/agent-store";
import {
  buildPostMeetingPlans,
  buildPreMeetingPlans,
} from "@/lib/agent-planner";
import { listEventContextsForDate } from "@/lib/google-workspace";
import { sendTelegramText } from "@/lib/telegram";
import { formatDisplayDate, getLocalDateString } from "@/lib/time";
import { AgentRunResult, EventContext } from "@/lib/types";

type RunAgentOptions = {
  targetDate?: string;
  dryRun?: boolean;
};

type AgentDependencies = {
  listEventContextsForDate?: typeof listEventContextsForDate;
  buildPreMeetingPlans?: typeof buildPreMeetingPlans;
  buildPostMeetingPlans?: typeof buildPostMeetingPlans;
  upsertMeetingSnapshots?: typeof upsertMeetingSnapshots;
  createAgentTasksIfMissing?: typeof createAgentTasksIfMissing;
  createActionProposalsIfMissing?: typeof createActionProposalsIfMissing;
  sendTelegramText?: typeof sendTelegramText;
  now?: () => Date;
};

function selectCandidateMeetings(
  phase: "pre" | "post",
  targetDate: string,
  meetingContexts: EventContext[],
  now: Date,
) {
  const config = getAppConfig();
  const today = getLocalDateString(now, config.timezone);

  if (targetDate !== today) {
    return meetingContexts;
  }

  if (phase === "pre") {
    const upperBound = now.getTime() + config.agent.preMeetingWindowMinutes * 60_000;

    return meetingContexts.filter((meeting) => {
      const start = new Date(meeting.start).getTime();
      return start >= now.getTime() && start <= upperBound;
    });
  }

  const lowerBound = now.getTime() - config.agent.postMeetingLookbackMinutes * 60_000;

  return meetingContexts.filter((meeting) => {
    const end = new Date(meeting.end).getTime();
    return end <= now.getTime() && end >= lowerBound;
  });
}

function buildAgentSummaryMessage(options: {
  phase: "pre" | "post";
  targetDate: string;
  meetingContexts: EventContext[];
  snapshots: AgentRunResult["snapshots"];
  tasksCreated: number;
  proposalsCreated: number;
}) {
  const config = getAppConfig();
  const displayDate = formatDisplayDate(options.targetDate, config.timezone);
  const label =
    options.phase === "pre" ? "Pre-meeting agent" : "Post-meeting agent";

  return [
    `${label} prepared ${options.meetingContexts.length} meeting${options.meetingContexts.length === 1 ? "" : "s"} for ${displayDate}.`,
    "",
    "Key points:",
    ...options.meetingContexts.slice(0, 4).map((meeting, index) => {
      const snapshot = options.snapshots[index];
      const confidence = snapshot?.confidence ?? "medium";
      return `- ${meeting.title}: ${confidence} confidence`;
    }),
    `- ${options.tasksCreated} task${options.tasksCreated === 1 ? "" : "s"} ready in Supabase`,
    `- ${options.proposalsCreated} proposal${options.proposalsCreated === 1 ? "" : "s"} awaiting approval`,
    "- Use /tasks to review follow-ups",
    "- Use /followups to inspect proposals",
    "- Use /approve <proposal_id> or /reject <proposal_id> to act",
  ].join("\n");
}

async function runAgentPhase(
  phase: "pre" | "post",
  options: RunAgentOptions = {},
  dependencies: AgentDependencies = {},
): Promise<AgentRunResult> {
  const config = getAppConfig();
  const now = dependencies.now?.() ?? new Date();
  const targetDate =
    options.targetDate ?? getLocalDateString(now, config.timezone);
  const allMeetings = await (
    dependencies.listEventContextsForDate ?? listEventContextsForDate
  )(targetDate);
  const candidateMeetings = selectCandidateMeetings(
    phase,
    targetDate,
    allMeetings,
    now,
  );

  const planner =
    phase === "pre"
      ? dependencies.buildPreMeetingPlans ?? buildPreMeetingPlans
      : dependencies.buildPostMeetingPlans ?? buildPostMeetingPlans;
  const plan = await planner(targetDate, candidateMeetings, {
    now: () => now,
  });

  if (!options.dryRun) {
    await (dependencies.upsertMeetingSnapshots ?? upsertMeetingSnapshots)(
      plan.snapshots,
    );
    await (dependencies.createAgentTasksIfMissing ?? createAgentTasksIfMissing)(
      plan.tasks,
    );
    await (
      dependencies.createActionProposalsIfMissing ?? createActionProposalsIfMissing
    )(plan.proposals);

    const botToken = config.telegramBotToken ?? config.telegram?.botToken;
    const chatId = config.telegram?.chatId;

    if (botToken && chatId && candidateMeetings.length > 0) {
      await (dependencies.sendTelegramText ?? sendTelegramText)({
        botToken,
        chatId,
        text: buildAgentSummaryMessage({
          phase,
          targetDate,
          meetingContexts: candidateMeetings,
          snapshots: plan.snapshots.map((snapshot) => ({
            eventId: snapshot.eventId,
            confidence:
              snapshot.prepBrief?.confidence ??
              snapshot.followupBrief?.confidence ??
              "medium",
          })),
          tasksCreated: plan.tasks.length,
          proposalsCreated: plan.proposals.length,
        }),
      });
    }
  }

  return {
    ok: true,
    phase,
    targetDate,
    meetingCount: allMeetings.length,
    processedMeetings: candidateMeetings.length,
    tasksCreated: plan.tasks.length,
    proposalsCreated: plan.proposals.length,
    notificationsSent:
      !options.dryRun &&
      Boolean((config.telegramBotToken ?? config.telegram?.botToken) && config.telegram?.chatId) &&
      candidateMeetings.length > 0
        ? 1
        : 0,
    usedFallback: plan.usedFallback,
    snapshots: plan.snapshots.map((snapshot) => ({
      eventId: snapshot.eventId,
      confidence:
        snapshot.prepBrief?.confidence ??
        snapshot.followupBrief?.confidence ??
        "medium",
    })),
  };
}

export function runPreMeetingAgent(
  options: RunAgentOptions = {},
  dependencies: AgentDependencies = {},
) {
  return runAgentPhase("pre", options, dependencies);
}

export function runPostMeetingAgent(
  options: RunAgentOptions = {},
  dependencies: AgentDependencies = {},
) {
  return runAgentPhase("post", options, dependencies);
}
