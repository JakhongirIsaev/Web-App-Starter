import { Router, type IRouter, type Request, type Response } from "express";
import { OcrFailureError, runOcrHealthcheck, runOcrRecognize, getOcrScriptPath } from "../lib/ocr/runner";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import multer from "multer";
import { guestAuth, requireAuth, requireAuthOrSignedUrl, requirePermission } from "../middleware/auth";
import { createSignedObjectParams } from "../lib/signedUrl";
import { getR2 } from "../storage/r2-client";
import { db } from "@workspace/db";
import { clientDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyClientAccess } from "../lib/client-access";
import { badRequest, unauthorized, forbidden, notFound, internalServerError } from "../lib/errors";
import { logger } from "../lib/logger";

// Storage backend selector. Default = local-fs (current safe behaviour).
// Flip to "r2" once Cloudflare R2 credentials are provisioned in the deploy
// environment. Exported for tests.
export function getStorageBackend(): "r2" | "local-fs" {
  return process.env.STORAGE_BACKEND === "r2" ? "r2" : "local-fs";
}

// Multer instance for the new multipart /storage/upload-document endpoint.
// Files held in memory so we can stream the buffer straight into R2 without
// touching disk. 25MB ceiling matches the R2 path size budget; the smaller
// 5MB CSV uploader in lib/csv.ts is intentionally separate.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

const router: IRouter = Router();
const LOCAL_OBJECT_PREFIX = "/local-objects/";
const DEFAULT_MAX_LOCAL_UPLOAD_BYTES = 12 * 1024 * 1024;
const configuredMaxUploadBytes = Number(process.env.FILE_STORAGE_MAX_BYTES);
const MAX_LOCAL_UPLOAD_BYTES =
  Number.isFinite(configuredMaxUploadBytes) && configuredMaxUploadBytes > 0
    ? configuredMaxUploadBytes
    : DEFAULT_MAX_LOCAL_UPLOAD_BYTES;

class UploadValidationError extends Error {}

const imageExtensionsByType: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function getLocalStorageRoot(): string {
  return path.resolve(process.env.FILE_STORAGE_DIR || path.join(process.cwd(), "uploads"));
}

function normalizeImageContentType(value: unknown): string | null {
  const contentType = String(value || "").split(";")[0].trim().toLowerCase();
  if (contentType === "image/jpg") return "image/jpeg";
  return imageExtensionsByType[contentType] ? contentType : null;
}

function parseUploadImage(body: any): { buffer: Buffer; contentType: string } {
  const rawDataUrl = body?.dataUrl;
  if (typeof rawDataUrl !== "string" || !rawDataUrl.trim()) {
    throw new UploadValidationError("Rasm ma'lumoti topilmadi");
  }

  const dataUrlMatch = rawDataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  const contentType = normalizeImageContentType(dataUrlMatch?.[1] || body?.contentType);
  if (!contentType) {
    throw new UploadValidationError("Rasm formati qo'llab-quvvatlanmaydi");
  }

  const base64Data = (dataUrlMatch ? dataUrlMatch[2] : rawDataUrl).replace(/\s/g, "");
  if (!base64Data || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
    throw new UploadValidationError("Rasm ma'lumoti noto'g'ri");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    throw new UploadValidationError("Bo'sh rasm yuklandi");
  }
  if (buffer.length > MAX_LOCAL_UPLOAD_BYTES) {
    throw new UploadValidationError(`Rasm hajmi ${MAX_LOCAL_UPLOAD_BYTES} baytdan oshmasligi kerak`);
  }

  return { buffer, contentType };
}

function sanitizePathSegment(segment: string): string {
  return segment
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^\.+$/, "")
    .slice(0, 80);
}

function buildLocalObjectPath(name: unknown, contentType: string): string {
  const fallbackName = `documents/upload-${Date.now()}`;
  const rawName = typeof name === "string" && name.trim() ? name : fallbackName;
  const parts = rawName
    .replace(/\\/g, "/")
    .split("/")
    .map(sanitizePathSegment)
    .filter(Boolean);
  const safeParts = parts.length > 0 ? parts : ["documents", `upload-${Date.now()}`];
  const originalFileName = safeParts.pop() || `upload-${Date.now()}`;
  const basename = originalFileName.replace(/\.[A-Za-z0-9]{1,8}$/, "") || "upload";
  const extension = imageExtensionsByType[contentType] || ".bin";
  const fileName = `${Date.now()}-${randomUUID()}-${basename}${extension}`;

  return [...safeParts, fileName].join("/");
}

function resolveLocalObjectPath(objectPath: string): string {
  if (!objectPath.startsWith(LOCAL_OBJECT_PREFIX)) {
    throw new ObjectNotFoundError();
  }

  const relativePath = objectPath.slice(LOCAL_OBJECT_PREFIX.length);
  if (!relativePath) {
    throw new ObjectNotFoundError();
  }

  const root = getLocalStorageRoot();
  const fullPath = path.resolve(root, relativePath);
  const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (fullPath !== root && !fullPath.startsWith(rootWithSeparator)) {
    throw new ObjectNotFoundError();
  }

  return fullPath;
}

function contentTypeForFile(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function resolveOcrLanguage(req: Request): "ru" | "uz" {
  const query = req.query as { language?: string };
  if (query.language === "ru") return "ru";
  const body = req.body as { language?: string } | undefined;
  if (body?.language === "ru") return "ru";
  const acceptLang = req.headers["accept-language"] || "";
  if (/^ru\b/i.test(acceptLang)) return "ru";
  return "uz";
}

const ocrErrorMessages = {
  missingImage:     { ru: "Данные изображения не указаны",                uz: "Rasm ma'lumoti ko'rsatilmagan" },
  uploadSaveFailed: { ru: "Не удалось сохранить загруженное изображение", uz: "Yuklangan rasmni saqlab bo'lmadi" },
  healthTimeout:    { ru: "Сервис распознавания не отвечает",             uz: "Matnni tanish xizmati javob bermadi" },
  healthFailed:     { ru: "Сервис распознавания не работает",             uz: "Matnni tanish xizmati ishlamadi" },
  healthParse:      { ru: "Не удалось прочитать результат проверки",      uz: "Matnni tanish tekshiruvi natijasini o'qib bo'lmadi" },
  ocrTimeout:       { ru: "Время распознавания истекло",                  uz: "Matnni tanish uchun vaqt tugadi" },
  ocrProcess:       { ru: "Процесс распознавания завершился с ошибкой",   uz: "Matnni tanish jarayoni xato bilan tugadi" },
  ocrParse:         { ru: "Не удалось прочитать результат распознавания",  uz: "Matnni tanish natijasini o'qib bo'lmadi" },
  ocrGeneric:       { ru: "Не удалось распознать текст документа",        uz: "Hujjat matnini tanib bo'lmadi" },
} as const;

const readableOcrRuMessages: Record<keyof typeof ocrErrorMessages, string> = {
  missingImage: "Данные изображения не указаны",
  uploadSaveFailed: "Не удалось сохранить загруженное изображение",
  healthTimeout: "Сервис распознавания не отвечает",
  healthFailed: "Сервис распознавания не работает",
  healthParse: "Не удалось прочитать результат проверки",
  ocrTimeout: "Время распознавания истекло",
  ocrProcess: "Процесс распознавания завершился с ошибкой",
  ocrParse: "Не удалось прочитать результат распознавания",
  ocrGeneric: "Не удалось распознать текст документа",
};

function getOcrErrorMessage(req: Request, key: keyof typeof ocrErrorMessages): string {
  if (resolveOcrLanguage(req) === "ru") {
    return readableOcrRuMessages[key];
  }
  return ocrErrorMessages[key][resolveOcrLanguage(req)];
}

router.post(
  "/storage/uploads/direct",
  guestAuth,
  requirePermission("storage.upload"),
  async (req: Request, res: Response) => {
    try {
      const { buffer, contentType } = parseUploadImage(req.body);
      const requestedName = typeof req.body?.name === "string" ? req.body.name : undefined;

      let objectPath: string;
      let displayName: string;

      if (getStorageBackend() === "r2") {
        // R2 path layout: client photos go under clients/{id}/... when the
        // caller supplied a name like "collateral/{clientId}/...". Otherwise
        // we fall back to a flat documents/ prefix. Either way the response
        // shape is preserved so existing mini-app callers don't change.
        const ext = imageExtensionsByType[contentType]?.replace(/^\./, "") ?? "bin";
        const uuid = randomUUID();
        const sanitizedName = requestedName
          ? requestedName.replace(/\\/g, "/").split("/").map(sanitizePathSegment).filter(Boolean).join("/")
          : "";
        // Pull a clientId hint out of "collateral/{id}/..." or "clients/{id}/..." prefixes.
        const clientIdMatch = sanitizedName.match(/^(?:collateral|clients|client)\/(\d+)\b/);
        const keyPrefix = clientIdMatch ? `clients/${clientIdMatch[1]}` : "documents";
        objectPath = `${keyPrefix}/${uuid}.${ext}`;
        displayName = requestedName || `${uuid}.${ext}`;

        await getR2().upload({ key: objectPath, body: buffer, contentType });
      } else {
        const relativePath = buildLocalObjectPath(requestedName, contentType);
        objectPath = `${LOCAL_OBJECT_PREFIX}${relativePath.replace(/\\/g, "/")}`;
        displayName = requestedName || path.basename(relativePath);

        const fullPath = resolveLocalObjectPath(objectPath);
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, buffer, { flag: "wx" });
      }

      res.status(201).json({
        objectPath,
        metadata: {
          name: displayName,
          size: buffer.length,
          contentType,
        },
      });
    } catch (error) {
      if (error instanceof UploadValidationError) {
        badRequest(res, error.message);
        return;
      }

      logger.error({ err: error }, "Error saving direct upload");
      res.status(500).json({ error: getOcrErrorMessage(req, "uploadSaveFailed") });
    }
  },
);

router.get("/ocr/health", requireAuth, async (req: Request, res: Response) => {
  const scriptPath = getOcrScriptPath();

  try {
    const result = await runOcrHealthcheck();
    res.json({ ...(result as object), scriptPath });
  } catch (error: unknown) {
    logger.error({ err: error, scriptPath }, "OCR health check error");
    if (error instanceof OcrFailureError) {
      const msgKey = error.kind === "timeout"
        ? "healthTimeout"
        : error.kind === "parse_error"
        ? "healthParse"
        : "healthFailed";
      res.status(500).json({ status: "error", error: getOcrErrorMessage(req, msgKey) });
      return;
    }
    res.status(500).json({ status: "error", error: getOcrErrorMessage(req, "healthFailed") });
  }
});

router.post(
  "/storage/signed-url",
  guestAuth,
  requirePermission("storage.signed_url"),
  async (req: Request, res: Response) => {
    const { path: objectPath } = req.body || {};
    if (typeof objectPath !== "string" || !objectPath) {
      badRequest(res, "path majburiy");
      return;
    }

    // Confirm the requester has access to the document at this path before
    // signing. Without this check any logged-in user could mint a signed URL
    // for any other user's documents (IDOR).
    const [doc] = await db
      .select({ clientId: clientDocumentsTable.clientId })
      .from(clientDocumentsTable)
      .where(eq(clientDocumentsTable.storagePath, objectPath))
      .limit(1);

    // Same opaque "not found" for missing docs and access-denied to avoid
    // leaking which paths exist for clients the requester can't see.
    if (!doc || !req.user || !(await verifyClientAccess(doc.clientId, req.user))) {
      notFound(res, "Hujjat topilmadi");
      return;
    }

    // Legacy local-FS path: keep returning the {exp, sig} HMAC params so old
    // documents written before R2 still load.
    if (objectPath.startsWith(LOCAL_OBJECT_PREFIX)) {
      const { exp, sig, expiresAt } = createSignedObjectParams(objectPath);
      res.json({ exp, sig, expiresAt });
      return;
    }

    // R2 path (new uploads land at "clients/{id}/{uuid}.{ext}" or
    // "documents/{uuid}.{ext}"). Mint a presigned URL the client can hit
    // directly. R2 backend must be configured.
    if (getStorageBackend() === "r2") {
      try {
        const url = await getR2().signedUrl(objectPath, 900);
        res.json({ url, expiresIn: 900 });
      } catch (error) {
        logger.error({ err: error, objectPath }, "Failed to mint R2 signed URL");
        internalServerError(res, "Signed URL yaratilmadi");
      }
      return;
    }

    // Path looks R2-shaped (no local-objects prefix) but the backend isn't
    // configured. Likely a misconfigured deploy — surface a hint.
    logger.warn({ objectPath }, "R2-shaped path requested but STORAGE_BACKEND != r2");
    res.status(500).json({
      error: "storage_backend_not_configured",
      message: "STORAGE_BACKEND=r2 is required to serve this object.",
    });
  },
);

router.get("/storage/file", requireAuthOrSignedUrl, async (req: Request, res: Response) => {
  const objectPath = req.query.path;
  if (typeof objectPath !== "string" || !objectPath) {
    badRequest(res, "Fayl yo'li ko'rsatilmagan");
    return;
  }

  // Bearer-authenticated requests need an explicit access check. Signed-URL
  // requests are implicitly authorized: issuance via POST /storage/signed-url
  // already ran the same check, and the HMAC proves the path was approved.
  const usedSignedUrl =
    typeof req.query.exp === "string" && typeof req.query.sig === "string";
  if (!usedSignedUrl) {
    const [doc] = await db
      .select({ clientId: clientDocumentsTable.clientId })
      .from(clientDocumentsTable)
      .where(eq(clientDocumentsTable.storagePath, objectPath))
      .limit(1);

    if (!doc || !req.user || !(await verifyClientAccess(doc.clientId, req.user))) {
      notFound(res, "Fayl topilmadi");
      return;
    }
  }

  try {
    if (objectPath.startsWith(LOCAL_OBJECT_PREFIX)) {
      const fullPath = resolveLocalObjectPath(objectPath);
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch (error: any) {
        if (error?.code === "ENOENT") {
          throw new ObjectNotFoundError();
        }
        throw error;
      }
      if (!stats.isFile()) {
        throw new ObjectNotFoundError();
      }

      const file = await fs.readFile(fullPath);
      res.setHeader("Content-Type", contentTypeForFile(fullPath));
      res.setHeader("Content-Length", String(stats.size));
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.status(200).send(file);
      return;
    }

    // Only local-storage paths are served. The legacy GCS/Replit-sidecar
    // path was removed; if a stale doc record points elsewhere, 404.
    throw new ObjectNotFoundError();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      notFound(res, "Fayl topilmadi");
      return;
    }
    logger.error({ err: error, objectPath }, "Error serving object");
    internalServerError(res, "Faylni ochib bo'lmadi");
  }
});

router.post("/ocr/recognize", guestAuth, async (req: Request, res: Response) => {
  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: getOcrErrorMessage(req, "missingImage") });
    return;
  }

  const base64Data = image.includes(",") ? image.split(",")[1] : image;

  try {
    const result = (await runOcrRecognize(base64Data)) as {
      success?: boolean;
      text?: string;
      boxes?: unknown;
      engine?: unknown;
      error?: string;
    };

    if (result.success) {
      res.json({ text: result.text, boxes: result.boxes, engine: result.engine });
    } else {
      logger.error({ error: result.error }, "OCR script returned failure");
      res.status(500).json({ error: getOcrErrorMessage(req, "ocrGeneric") });
    }
  } catch (error: unknown) {
    logger.error({ err: error }, "OCR error");
    if (error instanceof OcrFailureError) {
      const msgKey = error.kind === "timeout"
        ? "ocrTimeout"
        : error.kind === "parse_error"
        ? "ocrParse"
        : error.kind === "process_exit"
        ? "ocrProcess"
        : "ocrGeneric";
      res.status(500).json({
        error: getOcrErrorMessage(req, msgKey),
        ...(error.exitCode !== undefined && { exitCode: error.exitCode }),
      });
      return;
    }
    res.status(500).json({ error: getOcrErrorMessage(req, "ocrGeneric") });
  }
});

// New endpoint for non-image documents (PDF, scans, voice notes). Multipart
// upload, R2-only — local-FS fallback is intentionally a 503 so deploys
// without R2 get a clear error rather than silently filling the disk with
// arbitrary file types. Inserts a client_documents row inline so the gallery
// queries in A2.6/A2.7 can render straight after upload.
router.post(
  "/storage/upload-document",
  guestAuth,
  requirePermission("storage.upload"),
  documentUpload.single("file"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      badRequest(res, "no_file");
      return;
    }

    const file = req.file;
    const clientId = Number(req.body?.clientId);
    const docType = typeof req.body?.docType === "string" && req.body.docType.trim()
      ? String(req.body.docType)
      : "other";

    if (!clientId || !Number.isFinite(clientId)) {
      badRequest(res, "missing_clientId");
      return;
    }

    if (!req.user) {
      unauthorized(res, "unauthenticated");
      return;
    }

    if (!(await verifyClientAccess(clientId, req.user))) {
      forbidden(res, "Ruxsat yo'q");
      return;
    }

    if (getStorageBackend() !== "r2") {
      res.status(503).json({
        error: "storage_backend_not_configured",
        message: "Set STORAGE_BACKEND=r2 to upload documents.",
      });
      return;
    }

    const ext = (file.originalname.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const uuid = randomUUID();
    const storagePath = `clients/${clientId}/docs/${uuid}.${ext}`;

    try {
      await getR2().upload({
        key: storagePath,
        body: file.buffer,
        contentType: file.mimetype || "application/octet-stream",
      });

      const [doc] = await db
        .insert(clientDocumentsTable)
        .values({
          clientId,
          userId: req.user.id,
          docType,
          fileName: file.originalname,
          storagePath,
          mimeType: file.mimetype || null,
          sizeBytes: file.size,
        })
        .returning();

      res.status(201).json({
        id: doc.id,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
      });
    } catch (error) {
      logger.error({ err: error, clientId, storagePath }, "Failed to upload document to R2");
      internalServerError(res, "Yuklashda xato");
    }
  },
);

export default router;
