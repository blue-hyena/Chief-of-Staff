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
