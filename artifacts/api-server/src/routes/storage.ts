import { Router, type IRouter, type Request, type Response } from "express";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { guestAuth, requireAuthOrSignedUrl } from "../middleware/auth";
import { createSignedObjectParams } from "../lib/signedUrl";
import { db } from "@workspace/db";
import { clientDocumentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifyClientAccess } from "../lib/client-access";
import { logger } from "../lib/logger";

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

function getOcrScriptPath(): string {
  return path.resolve(process.cwd(), "src/ocr/paddle_ocr.py");
}

function getOcrTimeoutMs(): number {
  const configuredTimeout = Number(process.env.OCR_TIMEOUT_MS);
  return Number.isFinite(configuredTimeout) && configuredTimeout > 0
    ? configuredTimeout
    : 90_000;
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

function getOcrErrorMessage(req: Request, key: keyof typeof ocrErrorMessages): string {
  return ocrErrorMessages[key][resolveOcrLanguage(req)];
}

router.post("/storage/uploads/direct", guestAuth, async (req: Request, res: Response) => {
  try {
    const { buffer, contentType } = parseUploadImage(req.body);
    const relativePath = buildLocalObjectPath(req.body?.name, contentType);
    const objectPath = `${LOCAL_OBJECT_PREFIX}${relativePath.replace(/\\/g, "/")}`;
    const fullPath = resolveLocalObjectPath(objectPath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, buffer, { flag: "wx" });

    res.status(201).json({
      objectPath,
      metadata: {
        name: req.body?.name || path.basename(relativePath),
        size: buffer.length,
        contentType,
      },
    });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      res.status(400).json({ error: error.message });
      return;
    }

    logger.error({ err: error }, "Error saving direct upload");
    res.status(500).json({ error: getOcrErrorMessage(req, "uploadSaveFailed") });
  }
});

router.get("/ocr/health", async (req: Request, res: Response) => {
  const scriptPath = getOcrScriptPath();

  try {
    const result = await new Promise<any>((resolve, reject) => {
      const proc = spawn("python3", [scriptPath, "--health"], {
        env: {
          ...process.env,
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
        },
      });

      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        reject(new Error(getOcrErrorMessage(req, "healthTimeout")));
      }, 10_000);

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`${getOcrErrorMessage(req, "healthFailed")}: ${code}`));
          return;
        }

        if (stderr.trim()) {
          logger.warn({ stderr }, "PaddleOCR health check stderr (exit 0)");
        }

        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error(getOcrErrorMessage(req, "healthParse")));
        }
      });

      proc.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    res.json({ ...result, scriptPath });
  } catch (error: any) {
    logger.error({ err: error, scriptPath }, "OCR health check error");
    res.status(500).json({ status: "error", error: getOcrErrorMessage(req, "healthFailed") });
  }
});

router.post("/storage/signed-url", guestAuth, async (req: Request, res: Response) => {
  const { path: objectPath } = req.body || {};
  if (typeof objectPath !== "string" || !objectPath) {
    res.status(400).json({ error: "path majburiy" });
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
    res.status(404).json({ error: "Hujjat topilmadi" });
    return;
  }

  const { exp, sig, expiresAt } = createSignedObjectParams(objectPath);
  res.json({ exp, sig, expiresAt });
});

router.get("/storage/file", requireAuthOrSignedUrl, async (req: Request, res: Response) => {
  const objectPath = req.query.path;
  if (typeof objectPath !== "string" || !objectPath) {
    res.status(400).json({ error: "Fayl yo'li ko'rsatilmagan" });
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
      res.status(404).json({ error: "Fayl topilmadi" });
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
      res.status(404).json({ error: "Fayl topilmadi" });
      return;
    }
    logger.error({ err: error, objectPath }, "Error serving object");
    res.status(500).json({ error: "Faylni ochib bo'lmadi" });
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
    const scriptPath = getOcrScriptPath();
    const timeoutMs = getOcrTimeoutMs();

    const result = await new Promise<any>((resolve, reject) => {
      // Optional extra LD path for environments that need a specific libgcc_s.
      // On Nixpacks images the gcc lib lives under a content-addressed /nix/store
      // hash that changes between base-image rebuilds, so hardcoding it rots.
      // Set OCR_GCC_LIB_PATH in Railway variables only if the OS can't find
      // libgcc_s on its own (PaddleOCR throws "libgcc_s.so.1 must be installed").
      const extraLibPath = process.env["OCR_GCC_LIB_PATH"] || "";
      const existingLdPath = process.env["LD_LIBRARY_PATH"] || "";
      const ldLibraryPath = [extraLibPath, existingLdPath]
        .filter((segment) => segment && segment.length > 0)
        .join(":");
      const proc = spawn("python3", [scriptPath], {
        env: {
          ...process.env,
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
          ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
        },
      });

      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (error?: Error, value?: any) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve(value);
      };

      const timeout = setTimeout(() => {
        proc.kill("SIGKILL");
        finish(new Error(`${getOcrErrorMessage(req, "ocrTimeout")}: ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        if (code !== 0) {
          logger.error({ stderr, exitCode: code }, "PaddleOCR stderr");
          finish(new Error(`${getOcrErrorMessage(req, "ocrProcess")}: ${code}`));
        } else {
          if (stderr.trim()) {
            logger.warn({ stderr }, "PaddleOCR stderr (exit 0)");
          }
          try {
            finish(undefined, JSON.parse(stdout));
          } catch {
            finish(new Error(getOcrErrorMessage(req, "ocrParse")));
          }
        }
      });

      proc.on("error", (error) => finish(error));
      proc.stdin.write(JSON.stringify({ image: base64Data }));
      proc.stdin.end();
    });

    if (result.success) {
      res.json({ text: result.text, boxes: result.boxes, engine: result.engine });
    } else {
      logger.error({ error: result.error }, "OCR script returned failure");
      res.status(500).json({ error: getOcrErrorMessage(req, "ocrGeneric") });
    }
  } catch (error: any) {
    logger.error({ err: error }, "OCR error");
    const exitCodeMatch = error?.message?.match(/:\s*(\d+)$/);
    const exitCode = exitCodeMatch ? Number(exitCodeMatch[1]) : undefined;
    res.status(500).json({
      error: getOcrErrorMessage(req, "ocrGeneric"),
      ...(exitCode !== undefined && { exitCode }),
    });
  }
});

export default router;
