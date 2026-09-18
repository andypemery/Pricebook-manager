import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import { hasPermission } from "@/lib/permissions";
import {
  maximumSourceWorkbookBytes,
  sourceWorkbookContentTypes,
  SourceWorkbookPolicyError,
  validateSourceWorkbookDescriptor,
  type SourceWorkbookExtension
} from "@/lib/data-mapper/source-workbook-policy";
import {
  getSourceWorkbookStorage,
  sourceWorkbookStorageKey,
  type SourceWorkbookStorage
} from "@/lib/data-mapper/source-workbook-storage";

const uploadUrlLifetimeMilliseconds = 10 * 60 * 1000;
const uploadIntentLifetimeMilliseconds = 60 * 60 * 1000;

type UploadIntentPayload = {
  version: 2;
  uploadId: string;
  tenantId: string;
  userId: string;
  projectId: string;
  replaceSourceWorkbookImportId: string | null;
  originalFileName: string;
  fileSizeBytes: number;
  extension: SourceWorkbookExtension;
  contentType: string;
  storageKey: string;
  expiresAt: number;
};

export type SourceWorkbookUploadAuthorisation = {
  uploadIntent: string;
  uploadUrl: string;
  contentType: string;
  expiresAt: number;
};

export class SourceWorkbookUploadError extends Error {}

export function hasSourceWorkbookUploadPermission(actor: Pick<User, "role" | "permissions"> | null) {
  return Boolean(actor && hasPermission(actor, "uploadFiles") && hasPermission(actor, "editRecords"));
}

export function getSourceWorkbookUploadIntentSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters before source workbooks can be uploaded.");
  }
  return secret;
}

function signEncodedPayload(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function encodeUploadIntent(payload: UploadIntentPayload, secret: string) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${signEncodedPayload(encodedPayload, secret)}`;
}

function parseUploadIntentValue(uploadIntent: string, secret: string): UploadIntentPayload {
  if (!uploadIntent || uploadIntent.length > 8_192) throw new SourceWorkbookUploadError("The upload authorisation is invalid. Please upload the workbook again.");
  const parts = uploadIntent.split(".");
  if (parts.length !== 2) throw new SourceWorkbookUploadError("The upload authorisation is invalid. Please upload the workbook again.");
  const [encodedPayload, suppliedSignature] = parts;
  const expectedSignature = signEncodedPayload(encodedPayload, secret);
  const suppliedBytes = Buffer.from(suppliedSignature);
  const expectedBytes = Buffer.from(expectedSignature);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    throw new SourceWorkbookUploadError("The upload authorisation is invalid. Please upload the workbook again.");
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as UploadIntentPayload;
  } catch {
    throw new SourceWorkbookUploadError("The upload authorisation is invalid. Please upload the workbook again.");
  }
}

export function validateSourceWorkbookUploadIntent(input: {
  uploadIntent: string;
  actor: { id: string; tenantId: string };
  secret: string;
  now?: number;
}) {
  const payload = parseUploadIntentValue(input.uploadIntent, input.secret);
  const now = input.now ?? Date.now();
  if (payload.version !== 2 || !payload.uploadId || !payload.projectId || payload.projectId.length > 100 || payload.expiresAt <= now) {
    throw new SourceWorkbookUploadError("The upload authorisation has expired. Please upload the workbook again.");
  }
  if (payload.tenantId !== input.actor.tenantId || payload.userId !== input.actor.id) {
    throw new SourceWorkbookUploadError("The uploaded workbook does not belong to your authorised tenant context.");
  }

  let descriptor;
  try {
    descriptor = validateSourceWorkbookDescriptor({
      fileName: payload.originalFileName,
      fileSizeBytes: payload.fileSizeBytes,
      contentType: payload.contentType
    });
  } catch (error) {
    if (error instanceof SourceWorkbookPolicyError) throw new SourceWorkbookUploadError(error.message);
    throw error;
  }
  const expectedStorageKey = sourceWorkbookStorageKey(payload.tenantId, payload.uploadId, descriptor.extension);
  if (payload.extension !== descriptor.extension || payload.contentType !== descriptor.contentType || payload.storageKey !== expectedStorageKey) {
    throw new SourceWorkbookUploadError("The upload authorisation does not match the expected private storage path.");
  }
  if (payload.replaceSourceWorkbookImportId !== null && (typeof payload.replaceSourceWorkbookImportId !== "string" || !payload.replaceSourceWorkbookImportId || payload.replaceSourceWorkbookImportId.length > 100)) {
    throw new SourceWorkbookUploadError("The replacement source context is invalid.");
  }
  return payload;
}

export async function authoriseSourceWorkbookUpload(
  db: PrismaClient,
  actor: { id: string; tenantId: string },
  input: { fileName: unknown; fileSizeBytes: unknown; contentType: unknown; projectId: unknown; replaceSourceWorkbookImportId?: unknown },
  options: { storage?: SourceWorkbookStorage; secret?: string; now?: number; uploadId?: string } = {}
): Promise<SourceWorkbookUploadAuthorisation> {
  let descriptor;
  try {
    descriptor = validateSourceWorkbookDescriptor(input);
  } catch (error) {
    if (error instanceof SourceWorkbookPolicyError) throw new SourceWorkbookUploadError(error.message);
    throw error;
  }

  const replaceSourceWorkbookImportId = input.replaceSourceWorkbookImportId === undefined || input.replaceSourceWorkbookImportId === null || input.replaceSourceWorkbookImportId === ""
    ? null
    : String(input.replaceSourceWorkbookImportId);
  const suppliedProjectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  if (!suppliedProjectId || suppliedProjectId.length > 100) throw new SourceWorkbookUploadError("Choose a Project before uploading a workbook.");
  let projectId = suppliedProjectId;
  if (replaceSourceWorkbookImportId) {
    const existingSource = await db.sourceWorkbookImport.findFirst({
      where: { id: replaceSourceWorkbookImportId, tenantId: actor.tenantId },
      select: { id: true, projectId: true }
    });
    if (!existingSource) throw new SourceWorkbookUploadError("The source workbook to re-upload is not available for this tenant.");
    if (existingSource.projectId !== suppliedProjectId) throw new SourceWorkbookUploadError("The replacement workbook must remain in its existing Project.");
    projectId = existingSource.projectId;
  } else {
    const project = await db.project.findFirst({
      where: { id: projectId, tenantId: actor.tenantId },
      select: { id: true, sourceWorkbookImports: { take: 1, select: { id: true } } }
    });
    if (!project) throw new SourceWorkbookUploadError("The Project is not available.");
    if (project.sourceWorkbookImports.length > 0) throw new SourceWorkbookUploadError("This Project already has a workbook. Use Replace workbook to upload a corrected version.");
  }

  const now = options.now ?? Date.now();
  const uploadId = options.uploadId ?? randomUUID();
  const storageKey = sourceWorkbookStorageKey(actor.tenantId, uploadId, descriptor.extension);
  const uploadExpiresAt = now + uploadUrlLifetimeMilliseconds;
  const intentExpiresAt = now + uploadIntentLifetimeMilliseconds;
  const storage = options.storage ?? getSourceWorkbookStorage();
  const { uploadUrl } = await storage.authoriseUpload({
    storageKey,
    contentType: descriptor.contentType,
    maximumSizeInBytes: descriptor.fileSizeBytes,
    validUntil: uploadExpiresAt
  });
  const uploadIntent = encodeUploadIntent({
    version: 2,
    uploadId,
    tenantId: actor.tenantId,
    userId: actor.id,
    projectId,
    replaceSourceWorkbookImportId,
    originalFileName: descriptor.originalFileName,
    fileSizeBytes: descriptor.fileSizeBytes,
    extension: descriptor.extension,
    contentType: descriptor.contentType,
    storageKey,
    expiresAt: intentExpiresAt
  }, options.secret ?? getSourceWorkbookUploadIntentSecret());

  return { uploadIntent, uploadUrl, contentType: descriptor.contentType, expiresAt: uploadExpiresAt };
}

export { maximumSourceWorkbookBytes, sourceWorkbookContentTypes };
