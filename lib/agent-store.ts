import {
  ActionProposal,
  ActionProposalStatus,
  AgentTask,
  MeetingSnapshot,
} from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export const AGENT_TASKS_TABLE = "agent_tasks";
export const ACTION_PROPOSALS_TABLE = "action_proposals";
export const MEETING_SNAPSHOTS_TABLE = "meeting_snapshots";

type AgentTaskRow = {
  id: string;
  source_meeting_id: string | null;
  title: string;
  detail: string;
  owner: string | null;
  due_date: string | null;
  status: AgentTask["status"];
  priority: AgentTask["priority"];
  created_at: string;
  updated_at: string;
};

type ActionProposalRow = {
  id: string;
  kind: ActionProposal["kind"];
  status: ActionProposalStatus;
  payload: unknown;
  source_meeting_id: string | null;
  target_date: string | null;
  title: string;
  summary: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  executed_at: string | null;
  execution_error: string | null;
};

type MeetingSnapshotRow = {
  id: string;
  event_id: string;
  local_date: string;
  prep_brief: unknown;
  followup_brief: unknown;
  created_at: string;
  updated_at: string;
};

function parseAgentTaskRow(row: AgentTaskRow): AgentTask {
  return {
    id: row.id,
    sourceMeetingId: row.source_meeting_id ?? undefined,
    title: row.title,
    detail: row.detail,
    owner: row.owner ?? undefined,
    dueDate: row.due_date ?? undefined,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseActionProposalRow(row: ActionProposalRow): ActionProposal {
  const common = {
    id: row.id,
    kind: row.kind,
    status: row.status,
    sourceMeetingId: row.source_meeting_id ?? undefined,
    targetDate: row.target_date ?? undefined,
    title: row.title,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    approvedAt: row.approved_at ?? undefined,
    executedAt: row.executed_at ?? undefined,
    executionError: row.execution_error ?? undefined,
  };

  return {
    ...common,
    payload: row.payload as ActionProposal["payload"],
  } as ActionProposal;
}

function parseMeetingSnapshotRow(row: MeetingSnapshotRow): MeetingSnapshot {
  return {
    id: row.id,
    eventId: row.event_id,
    localDate: row.local_date,
    prepBrief: (row.prep_brief as MeetingSnapshot["prepBrief"]) ?? undefined,
    followupBrief:
      (row.followup_brief as MeetingSnapshot["followupBrief"]) ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createAgentTasksIfMissing(tasks: AgentTask[]) {
  if (tasks.length === 0) {
    return;
  }

  const client = getSupabaseServerClient();
  const { error } = await client.from(AGENT_TASKS_TABLE).upsert(
    tasks.map((task) => ({
      id: task.id,
      source_meeting_id: task.sourceMeetingId ?? null,
      title: task.title,
      detail: task.detail,
      owner: task.owner ?? null,
      due_date: task.dueDate ?? null,
      status: task.status,
      priority: task.priority,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    })),
    {
      onConflict: "id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`Failed to store agent tasks: ${error.message}`);
  }
}

export async function listOpenAgentTasks(limit = 10) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(AGENT_TASKS_TABLE)
    .select(
      "id, source_meeting_id, title, detail, owner, due_date, status, priority, created_at, updated_at",
    )
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<AgentTaskRow[]>();

  if (error) {
    throw new Error(`Failed to list agent tasks: ${error.message}`);
  }

  return (data ?? []).map(parseAgentTaskRow);
}

export async function createActionProposalsIfMissing(proposals: ActionProposal[]) {
  if (proposals.length === 0) {
    return;
  }

  const client = getSupabaseServerClient();
  const { error } = await client.from(ACTION_PROPOSALS_TABLE).upsert(
    proposals.map((proposal) => ({
      id: proposal.id,
      kind: proposal.kind,
      status: proposal.status,
      payload: proposal.payload,
      source_meeting_id: proposal.sourceMeetingId ?? null,
      target_date: proposal.targetDate ?? null,
      title: proposal.title,
      summary: proposal.summary,
      created_at: proposal.createdAt,
      updated_at: proposal.updatedAt,
      approved_at: proposal.approvedAt ?? null,
      executed_at: proposal.executedAt ?? null,
      execution_error: proposal.executionError ?? null,
    })),
    {
      onConflict: "id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    throw new Error(`Failed to store action proposals: ${error.message}`);
  }
}

export async function listPendingActionProposals(limit = 10) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(ACTION_PROPOSALS_TABLE)
    .select(
      "id, kind, status, payload, source_meeting_id, target_date, title, summary, created_at, updated_at, approved_at, executed_at, execution_error",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)
    .returns<ActionProposalRow[]>();

  if (error) {
    throw new Error(`Failed to list pending action proposals: ${error.message}`);
  }

  return (data ?? []).map(parseActionProposalRow);
}

export async function getActionProposalById(proposalId: string) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(ACTION_PROPOSALS_TABLE)
    .select(
      "id, kind, status, payload, source_meeting_id, target_date, title, summary, created_at, updated_at, approved_at, executed_at, execution_error",
    )
    .eq("id", proposalId)
    .maybeSingle<ActionProposalRow>();

  if (error) {
    throw new Error(`Failed to load action proposal ${proposalId}: ${error.message}`);
  }

  return data ? parseActionProposalRow(data) : null;
}

export async function updateActionProposalStatus(options: {
  proposalId: string;
  status: ActionProposalStatus;
  approvedAt?: string;
  executedAt?: string;
  executionError?: string;
}) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(ACTION_PROPOSALS_TABLE)
    .update({
      status: options.status,
      approved_at: options.approvedAt ?? null,
      executed_at: options.executedAt ?? null,
      execution_error: options.executionError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.proposalId)
    .select(
      "id, kind, status, payload, source_meeting_id, target_date, title, summary, created_at, updated_at, approved_at, executed_at, execution_error",
    )
    .maybeSingle<ActionProposalRow>();

  if (error) {
    throw new Error(`Failed to update action proposal ${options.proposalId}: ${error.message}`);
  }

  return data ? parseActionProposalRow(data) : null;
}

export async function upsertMeetingSnapshots(snapshots: MeetingSnapshot[]) {
  if (snapshots.length === 0) {
    return;
  }

  const client = getSupabaseServerClient();
  const { error } = await client.from(MEETING_SNAPSHOTS_TABLE).upsert(
    snapshots.map((snapshot) => ({
      id: snapshot.id,
      event_id: snapshot.eventId,
      local_date: snapshot.localDate,
      prep_brief: snapshot.prepBrief ?? null,
      followup_brief: snapshot.followupBrief ?? null,
      created_at: snapshot.createdAt,
      updated_at: snapshot.updatedAt,
    })),
    {
      onConflict: "id",
    },
  );

  if (error) {
    throw new Error(`Failed to store meeting snapshots: ${error.message}`);
  }
}

export async function listMeetingSnapshotsForDate(localDate: string) {
  const client = getSupabaseServerClient();
  const { data, error } = await client
    .from(MEETING_SNAPSHOTS_TABLE)
    .select(
      "id, event_id, local_date, prep_brief, followup_brief, created_at, updated_at",
    )
    .eq("local_date", localDate)
    .returns<MeetingSnapshotRow[]>();

  if (error) {
    throw new Error(`Failed to list meeting snapshots for ${localDate}: ${error.message}`);
  }

  return (data ?? []).map(parseMeetingSnapshotRow);
}
