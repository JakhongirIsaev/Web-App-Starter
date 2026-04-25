import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { spawn } from "child_process";
import path from "path";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
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
    throw new UploadValidationError("Missing image data");
  }

  const dataUrlMatch = rawDataUrl.match(/^data:([^;,]+);base64,(.*)$/s);
  const contentType = normalizeImageContentType(dataUrlMatch?.[1] || body?.contentType);
  if (!contentType) {
    throw new UploadValidationError("Unsupported image content type");
  }

  const base64Data = (dataUrlMatch ? dataUrlMatch[2] : rawDataUrl).replace(/\s/g, "");
  if (!base64Data || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Data)) {
    throw new UploadValidationError("Invalid base64 image data");
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (!buffer.length) {
    throw new UploadValidationError("Empty image upload");
  }
  if (buffer.length > MAX_LOCAL_UPLOAD_BYTES) {
    throw new UploadValidationError(`Image exceeds ${MAX_LOCAL_UPLOAD_BYTES} byte limit`);
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

router.post("/storage/uploads/request-url", requireAuth, async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body || {};
  if (!name || !contentType) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    logger.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.post("/storage/uploads/direct", requireAuth, async (req: Request, res: Response) => {
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
    res.status(500).json({ error: "Failed to save upload" });
  }
});

router.get("/ocr/health", async (_req: Request, res: Response) => {
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
        reject(new Error("OCR health check timed out"));
      }, 10_000);

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        clearTimeout(timeout);
        if (code !== 0) {
          reject(new Error(`OCR health check exited with code ${code}: ${stderr.slice(-500)}`));
          return;
        }

        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("Failed to parse OCR health check output"));
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
    res.status(500).json({ status: "error", error: error.message || "OCR health check failed" });
  }
});

router.get("/storage/file", requireAuth, async (req: Request, res: Response) => {
  const objectPath = req.query.path;
  if (typeof objectPath !== "string" || !objectPath) {
    res.status(400).json({ error: "Missing object path" });
    return;
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

    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
    const objectResponse = await objectStorageService.downloadObject(objectFile);

    objectResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (!objectResponse.body) {
      res.status(objectResponse.status).end();
      return;
    }

    res.status(objectResponse.status);
    const nodeStream = Readable.fromWeb(objectResponse.body as globalThis.ReadableStream);
    nodeStream.pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    logger.error({ err: error, objectPath }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

router.post("/ocr/recognize", requireAuth, async (req: Request, res: Response) => {
  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "Missing image data (base64)" });
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
        finish(new Error(`OCR timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        if (code !== 0) {
          logger.error({ stderr }, "PaddleOCR stderr");
          finish(new Error(`OCR exited with code ${code}: ${stderr.slice(-500)}`));
        } else {
          try {
            finish(undefined, JSON.parse(stdout));
          } catch {
            finish(new Error("Failed to parse OCR output"));
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
      res.status(500).json({ error: result.error || "OCR failed" });
    }
  } catch (error: any) {
    logger.error({ err: error }, "OCR error");
    res.status(500).json({ error: error.message || "OCR processing failed" });
  }
});

export default router;
