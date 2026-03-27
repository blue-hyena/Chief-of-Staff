import pdfParse from "pdf-parse";
import { google, calendar_v3, drive_v3, gmail_v1, sheets_v4 } from "googleapis";
import { JWT, OAuth2Client } from "google-auth-library";
import { getAppConfig } from "@/lib/config";
import { getOAuthAuthorizedClient } from "@/lib/google-auth";
import { getUtcRangeForLocalDate } from "@/lib/time";
import {
  AttachmentContext,
  EventContext,
  MeetingAttachment,
  MeetingParticipant,
} from "@/lib/types";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/spreadsheets",
];

type GoogleClients = {
  auth: JWT | OAuth2Client;
  calendar: calendar_v3.Calendar;
  drive: drive_v3.Drive;
  gmail: gmail_v1.Gmail;
  sheets: sheets_v4.Sheets;
  senderEmail?: string;
};

let cachedClientsPromise: Promise<GoogleClients> | null = null;

async function getClients() {
  if (cachedClientsPromise) {
    return cachedClientsPromise;
  }

  cachedClientsPromise = (async () => {
    const config = getAppConfig();

    if (config.googleAuthMode === "oauth") {
      const { auth, userEmail } = await getOAuthAuthorizedClient();

      return {
        auth,
        calendar: google.calendar({ version: "v3", auth }),
        drive: google.drive({ version: "v3", auth }),
        gmail: google.gmail({ version: "v1", auth }),
        sheets: google.sheets({ version: "v4", auth }),
        senderEmail: userEmail ?? undefined,
      };
    }

    const auth = new google.auth.JWT({
      email: config.serviceAccount!.client_email,
      key: config.serviceAccount!.private_key,
      scopes: GOOGLE_SCOPES,
      subject: config.googleDelegatedUser,
    });

    return {
      auth,
      calendar: google.calendar({ version: "v3", auth }),
      drive: google.drive({ version: "v3", auth }),
      gmail: google.gmail({ version: "v1", auth }),
      sheets: google.sheets({ version: "v4", auth }),
      senderEmail: config.googleDelegatedUser,
    };
  })().catch((error) => {
    cachedClientsPromise = null;
    throw error;
  });

  return cachedClientsPromise;
}

function parseDriveFileId(url: string) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/document\/d\/([a-zA-Z0-9_-]+)/,
    /\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractDriveLinks(description: string) {
  const urlMatches =
    description.match(/https:\/\/[^\s)]+/g)?.map((url) => url.trim()) ?? [];

  return urlMatches
    .map((url) => ({ url, id: parseDriveFileId(url) }))
    .filter((item): item is { url: string; id: string } => Boolean(item.id));
}

function normalizeAttendees(
  attendees?: calendar_v3.Schema$EventAttendee[],
): MeetingParticipant[] {
  return (
    attendees?.map((attendee) => ({
      name: attendee.displayName ?? undefined,
      email: attendee.email ?? undefined,
      responseStatus: attendee.responseStatus ?? undefined,
    })) ?? []
  );
}

async function getDriveFileMetadata(fileId: string, webViewLink?: string) {
  const { drive } = await getClients();
  const response = await drive.files.get({
    fileId,
    fields: "id,name,mimeType,webViewLink",
    supportsAllDrives: true,
  });
  const file = response.data;

  if (!file.id || !file.name || !file.mimeType) {
    throw new Error(`Drive file ${fileId} is missing required metadata.`);
  }

  return {
    id: file.id,
    title: file.name,
    mimeType: file.mimeType,
    webViewLink: file.webViewLink ?? webViewLink,
  };
}

function dedupeAttachments(attachments: MeetingAttachment[]) {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    if (seen.has(attachment.id)) {
      return false;
    }

    seen.add(attachment.id);
    return true;
  });
}

async function collectAttachments(
  event: calendar_v3.Schema$Event,
): Promise<MeetingAttachment[]> {
  const config = getAppConfig();
  const calendarAttachments =
    event.attachments?.flatMap((attachment) => {
      const fileId = attachment.fileId;
      const title = attachment.title;
      const mimeType = attachment.mimeType;

      if (!fileId || !title || !mimeType) {
        return [];
      }

      return [
        {
          id: fileId,
          title,
          mimeType,
          source: "calendar_attachment" as const,
          webViewLink: attachment.fileUrl ?? undefined,
        },
      ];
    }) ?? [];

  const descriptionLinks = extractDriveLinks(event.description ?? "");
  const resolvedDescriptionLinks = await Promise.all(
    descriptionLinks.slice(0, config.maxAttachmentsPerEvent).map(async (item) => {
      const metadata = await getDriveFileMetadata(item.id, item.url);
      return {
        ...metadata,
        source: "description_link" as const,
      };
    }),
  );

  return dedupeAttachments([...calendarAttachments, ...resolvedDescriptionLinks]).slice(
    0,
    config.maxAttachmentsPerEvent,
  );
}

function trimExtractedText(text: string) {
  const config = getAppConfig();
  const compact = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return compact.slice(0, config.maxDocumentChars);
}

async function downloadFileBuffer(fileId: string) {
  const { drive } = await getClients();
  const response = await drive.files.get(
    {
      fileId,
      alt: "media",
      supportsAllDrives: true,
    },
    {
      responseType: "arraybuffer",
    },
  );

  return Buffer.from(response.data as ArrayBuffer);
}

async function exportGoogleDoc(fileId: string) {
  const { drive } = await getClients();
  const response = await drive.files.export(
    {
      fileId,
      mimeType: "text/plain",
    },
    {
      responseType: "arraybuffer",
    },
  );

  return Buffer.from(response.data as ArrayBuffer).toString("utf8");
}

async function extractSpreadsheetText(fileId: string) {
  const { sheets } = await getClients();
  const metadata = await sheets.spreadsheets.get({
    spreadsheetId: fileId,
    fields: "sheets(properties(title))",
  });

  const ranges =
    metadata.data.sheets
      ?.map((sheet) => sheet.properties?.title)
      .filter((title): title is string => Boolean(title))
      .slice(0, 3)
      .map((title) => `${title}!A1:G20`) ?? [];

  if (ranges.length === 0) {
    return "";
  }

  const values = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: fileId,
    ranges,
    majorDimension: "ROWS",
  });

  const sections =
    values.data.valueRanges?.map((range) => {
      const title = range.range?.split("!")[0] ?? "Sheet";
      const rows = range.values ?? [];
      const rowText = rows.map((row) => row.join(" | ")).join("\n");
      return `Sheet: ${title}\n${rowText}`;
    }) ?? [];

  return sections.join("\n\n");
}

async function extractAttachmentContext(
  attachment: MeetingAttachment,
): Promise<AttachmentContext> {
  try {
    let extractedText = "";

    if (attachment.mimeType === "application/vnd.google-apps.document") {
      extractedText = await exportGoogleDoc(attachment.id);
    } else if (attachment.mimeType === "application/vnd.google-apps.spreadsheet") {
      extractedText = await extractSpreadsheetText(attachment.id);
    } else if (attachment.mimeType === "application/pdf") {
      const buffer = await downloadFileBuffer(attachment.id);
      extractedText = (await pdfParse(buffer)).text;
    } else if (attachment.mimeType.startsWith("text/")) {
      const buffer = await downloadFileBuffer(attachment.id);
      extractedText = buffer.toString("utf8");
    } else {
      return {
        ...attachment,
        extractedText: "",
        extractedChars: 0,
        extractionError: `Unsupported mime type: ${attachment.mimeType}`,
      };
    }

    const trimmed = trimExtractedText(extractedText);

    return {
      ...attachment,
      extractedText: trimmed,
      extractedChars: trimmed.length,
    };
  } catch (error) {
    return {
      ...attachment,
      extractedText: "",
      extractedChars: 0,
      extractionError:
        error instanceof Error ? error.message : "Failed to extract attachment",
    };
  }
}

export async function listEventContextsForDate(localDate: string) {
  const config = getAppConfig();
  const { calendar } = await getClients();
  const { startIso, endIso } = getUtcRangeForLocalDate(localDate, config.timezone);

  const response = await calendar.events.list({
    calendarId: config.googleCalendarId,
    timeMin: startIso,
    timeMax: endIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: config.maxMeetingsPerBriefing,
  });

  const events =
    response.data.items?.filter((event) => Boolean(event.id && event.start)) ?? [];

  const contexts = await Promise.all(
    events.map(async (event) => {
      const attachments = await collectAttachments(event);
      const attachmentContexts = await Promise.all(
        attachments.map((attachment) => extractAttachmentContext(attachment)),
      );

      return {
        eventId: event.id as string,
        title: event.summary?.trim() || "Untitled Meeting",
        description: event.description?.trim() ?? "",
        location: event.location ?? undefined,
        htmlLink: event.htmlLink ?? undefined,
        start: event.start?.dateTime ?? event.start?.date ?? "",
        end: event.end?.dateTime ?? event.end?.date ?? "",
        attendees: normalizeAttendees(event.attendees),
        attachments: attachmentContexts,
      } satisfies EventContext;
    }),
  );

  return contexts;
}

export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}) {
  const { gmail, senderEmail } = await getClients();
  const boundary = `briefing_${Date.now()}`;
  const headers = [
    `From: ${senderEmail ?? options.to}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  if (options.replyTo) {
    headers.push(`Reply-To: ${options.replyTo}`);
  }

  const mimeMessage = [
    ...headers,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    options.text,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    options.html,
    "",
    `--${boundary}--`,
  ].join("\r\n");

  const raw = Buffer.from(mimeMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw,
    },
  });
}

export async function inspectDriveFolder(folderId: string) {
  const { drive } = await getClients();
  const folder = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,owners(displayName,emailAddress),shared,webViewLink",
    supportsAllDrives: true,
  });
  const children = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
    pageSize: 50,
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  });

  return {
    folder: folder.data,
    files: children.data.files ?? [],
  };
}

export async function createWorkspaceTestAssets(folderId: string) {
  const { auth, drive, sheets } = await getClients();
  const docs = google.docs({
    version: "v1",
    auth,
  });
  const timestamp = new Date().toISOString();
  const createdDocs: Array<{ title: string; id: string; url?: string | null }> = [];

  for (let index = 1; index <= 5; index += 1) {
    const title = `Workspace Test Document ${index}`;
    const createRes = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: "application/vnd.google-apps.document",
        parents: [folderId],
      },
      fields: "id,name,webViewLink",
      supportsAllDrives: true,
    });

    if (!createRes.data.id) {
      throw new Error(`Drive did not return an ID for ${title}.`);
    }

    await docs.documents.batchUpdate({
      documentId: createRes.data.id,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: [
                title,
                "",
                `Created for Google Workspace connectivity testing at ${timestamp}.`,
                "This is a deterministic test document for the morning briefing project.",
                `Sequence number: ${index}`,
                "",
              ].join("\n"),
            },
          },
        ],
      },
    });

    createdDocs.push({
      title: createRes.data.name ?? title,
      id: createRes.data.id,
      url: createRes.data.webViewLink,
    });
  }

  const sheetCreateRes = await drive.files.create({
    requestBody: {
      name: "Workspace Test Tracker",
      mimeType: "application/vnd.google-apps.spreadsheet",
      parents: [folderId],
    },
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });

  if (!sheetCreateRes.data.id) {
    throw new Error("Drive did not return an ID for the tracker sheet.");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetCreateRes.data.id,
    range: "Sheet1!A1:E6",
    valueInputOption: "RAW",
    requestBody: {
      values: [
        ["Title", "Document ID", "Link", "Status", "Created At"],
        ...createdDocs.map((doc) => [
          doc.title,
          doc.id,
          doc.url ?? "",
          "created",
          timestamp,
        ]),
      ],
    },
  });

  return {
    createdDocs,
    trackerSheet: {
      title: sheetCreateRes.data.name ?? "Workspace Test Tracker",
      id: sheetCreateRes.data.id,
      url: sheetCreateRes.data.webViewLink,
    },
  };
}
