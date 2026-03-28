export type MeetingParticipant = {
  name?: string;
  email?: string;
  responseStatus?: string;
};

export type MeetingAttachment = {
  id: string;
  title: string;
  mimeType: string;
  source: "calendar_attachment" | "description_link";
  webViewLink?: string;
};

export type AttachmentContext = MeetingAttachment & {
  extractedText: string;
  extractedChars: number;
  extractionError?: string;
};

export type EventContext = {
  eventId: string;
  title: string;
  description: string;
  location?: string;
  htmlLink?: string;
  start: string;
  end: string;
  attendees: MeetingParticipant[];
  attachments: AttachmentContext[];
};

export type MeetingBriefing = {
  eventId: string;
  title: string;
  start: string;
  end: string;
  participants: string[];
  summary: string;
  keyPoints: string[];
  prepNotes: string[];
  risks: string[];
  actionItems: string[];
  sourceReferences: string[];
  pmSynthesis: {
    recommendedTalkingPoints: string[];
    decisionsToDrive: string[];
    stakeholderSignals: string[];
  };
};

export type BriefingPayload = {
  date: string;
  executiveSummary: string;
  topActions: string[];
  meetings: MeetingBriefing[];
  pmSynthesis: {
    dailyPriorities: string[];
    crossMeetingRisks: string[];
    stakeholderUpdateDraft: string[];
  };
  metadata: {
    calendarId: string;
    timezone: string;
    generatedAt: string;
    notes: string[];
  };
};

export type DeliveryChannel = "email" | "telegram";
export type BriefingSynthesisMode = "deterministic" | "fireworks";

export type ChannelDeliveryResult = {
  attempted: boolean;
  sent: boolean;
  error?: string;
};

export type DeliveryResults = Record<DeliveryChannel, ChannelDeliveryResult>;

export type RunMorningBriefingOptions = {
  targetDate?: string;
  dryRun?: boolean;
};

export type RunMorningBriefingResult = {
  ok: true;
  targetDate: string;
  meetingCount: number;
  deliveries: DeliveryResults;
  usedFallback: boolean;
  payload: BriefingPayload;
};

export type AgentTaskStatus = "pending" | "done" | "cancelled";
export type AgentTaskPriority = "high" | "medium" | "low";

export type AgentTask = {
  id: string;
  sourceMeetingId?: string;
  title: string;
  detail: string;
  owner?: string;
  dueDate?: string;
  status: AgentTaskStatus;
  priority: AgentTaskPriority;
  createdAt: string;
  updatedAt: string;
};

export type ActionProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "executed"
  | "failed";

export type SendEmailProposalPayload = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  summary: string;
};

export type SendTelegramProposalPayload = {
  chatId?: string;
  message: string;
  summary: string;
};

export type CreateGoogleDocProposalPayload = {
  folderId?: string;
  title: string;
  body: string;
  summary: string;
};

export type UpdateGoogleSheetProposalPayload = {
  spreadsheetId?: string;
  sheetName?: string;
  rows: string[][];
  summary: string;
};

export type ActionProposal =
  | {
      id: string;
      kind: "send_email";
      status: ActionProposalStatus;
      sourceMeetingId?: string;
      targetDate?: string;
      title: string;
      summary: string;
      payload: SendEmailProposalPayload;
      createdAt: string;
      updatedAt: string;
      approvedAt?: string;
      executedAt?: string;
      executionError?: string;
    }
  | {
      id: string;
      kind: "send_telegram_message";
      status: ActionProposalStatus;
      sourceMeetingId?: string;
      targetDate?: string;
      title: string;
      summary: string;
      payload: SendTelegramProposalPayload;
      createdAt: string;
      updatedAt: string;
      approvedAt?: string;
      executedAt?: string;
      executionError?: string;
    }
  | {
      id: string;
      kind: "create_google_doc";
      status: ActionProposalStatus;
      sourceMeetingId?: string;
      targetDate?: string;
      title: string;
      summary: string;
      payload: CreateGoogleDocProposalPayload;
      createdAt: string;
      updatedAt: string;
      approvedAt?: string;
      executedAt?: string;
      executionError?: string;
    }
  | {
      id: string;
      kind: "update_google_sheet";
      status: ActionProposalStatus;
      sourceMeetingId?: string;
      targetDate?: string;
      title: string;
      summary: string;
      payload: UpdateGoogleSheetProposalPayload;
      createdAt: string;
      updatedAt: string;
      approvedAt?: string;
      executedAt?: string;
      executionError?: string;
    };

export type MeetingPrepSnapshot = {
  brief: string;
  agenda: string[];
  risks: string[];
  decisionsToDrive: string[];
  stakeholderSignals: string[];
  confidence: "high" | "medium" | "low";
};

export type MeetingFollowupSnapshot = {
  brief: string;
  recapPoints: string[];
  nextSteps: string[];
  needsNotes: boolean;
  confidence: "high" | "medium" | "low";
};

export type MeetingSnapshot = {
  id: string;
  eventId: string;
  localDate: string;
  prepBrief?: MeetingPrepSnapshot;
  followupBrief?: MeetingFollowupSnapshot;
  createdAt: string;
  updatedAt: string;
};

export type AgentRunResult = {
  ok: true;
  phase: "pre" | "post";
  targetDate: string;
  meetingCount: number;
  processedMeetings: number;
  tasksCreated: number;
  proposalsCreated: number;
  notificationsSent: number;
  usedFallback: boolean;
  snapshots: Array<{
    eventId: string;
    confidence: "high" | "medium" | "low";
  }>;
};
