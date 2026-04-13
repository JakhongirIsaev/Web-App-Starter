import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { Readable } from "stream";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";
import { env } from "../lib/env";

const router: IRouter = Router();

function requireObjectStorage(_req: Request, res: Response, next: NextFunction) {
  if (!env.objectStorageEnabled) {
    res.status(503).json({
      error: "Object storage not configured",
      details: "Set PUBLIC_OBJECT_SEARCH_PATHS and PRIVATE_OBJECT_DIR, and provide a GCS backend or alternative.",
    });
    return;
  }
  next();
}

function requireOcr(_req: Request, res: Response, next: NextFunction) {
  if (!env.ocrEnabled) {
    res.status(503).json({
      error: "OCR not configured",
      details: "PaddleOCR requires a Python runtime. Set ENABLE_OCR=true only on environments with Python + PaddleOCR installed.",
    });
    return;
  }
  next();
}

let objectStorageService: ObjectStorageService | null = null;
function getObjectStorage(): ObjectStorageService {
  if (!objectStorageService) {
    objectStorageService = new ObjectStorageService();
  }
  return objectStorageService;
}

function getPythonExecutable() {
  const configuredPath = process.env["PYTHON_EXECUTABLE"];
  if (configuredPath) {
    return configuredPath;
  }

  const virtualEnvPython = path.resolve(process.cwd(), ".venv", "bin", "python");
  return existsSync(virtualEnvPython) ? virtualEnvPython : "python3";
}

router.post("/storage/uploads/request-url", requireAuth, requireObjectStorage, async (req: Request, res: Response) => {
  const { name, size, contentType } = req.body || {};
  if (!name || !contentType) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const svc = getObjectStorage();
    const uploadURL = await svc.getObjectEntityUploadURL();
    const objectPath = svc.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
  } catch (error) {
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/objects/:objectPath", requireAuth, requireObjectStorage, async (req: Request, res: Response) => {
  const objectPath = req.params.objectPath;
  if (!objectPath) {
    res.status(400).json({ error: "Missing object path" });
    return;
  }

  try {
    const svc = getObjectStorage();
    const readStream = await svc.getObjectEntityReadStream(objectPath);
    const metadata = await svc.getObjectEntityMetadata(objectPath);

    if (metadata.contentType) {
      res.setHeader("Content-Type", metadata.contentType);
    }
    if (metadata.size) {
      res.setHeader("Content-Length", metadata.size.toString());
    }
    res.setHeader("Cache-Control", "private, max-age=3600");

    const nodeStream = readStream instanceof Readable ? readStream : Readable.from(readStream as any);
    nodeStream.pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    console.error("Error serving object:", error);
    res.status(500).json({ error: "Failed to serve object" });
  }
});

router.post("/ocr/recognize", requireAuth, requireOcr, async (req: Request, res: Response) => {
  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    res.status(400).json({ error: "Missing image data (base64)" });
    return;
  }

  const base64Data = image.includes(",") ? image.split(",")[1] : image;

  try {
    const scriptPath = path.resolve(
      process.cwd(),
      "src/ocr/paddle_ocr.py"
    );

    const result = await new Promise<any>((resolve, reject) => {
      const gccLibPath = "/nix/store/bmi5znnqk4kg2grkrhk6py0irc8phf6l-gcc-14.2.1.20250322-lib/lib";
      const existingLdPath = process.env["LD_LIBRARY_PATH"] || "";
      const proc = spawn(getPythonExecutable(), [scriptPath], {
        env: {
          ...process.env,
          PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
          LD_LIBRARY_PATH: existingLdPath ? `${gccLibPath}:${existingLdPath}` : gccLibPath,
        },
      });

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.on("close", (code: number) => {
        if (code !== 0) {
          console.error("PaddleOCR stderr:", stderr);
          reject(new Error(`PaddleOCR exited with code ${code}: ${stderr.slice(-500)}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch {
            reject(new Error("Failed to parse PaddleOCR output"));
          }
        }
      });

      proc.on("error", reject);
      proc.stdin.write(JSON.stringify({ image: base64Data }));
      proc.stdin.end();
    });

    if (result.success) {
      res.json({ text: result.text, boxes: result.boxes });
    } else {
      res.status(500).json({ error: result.error || "OCR failed" });
    }
  } catch (error: any) {
    console.error("OCR error:", error);
    res.status(500).json({ error: error.message || "OCR processing failed" });
  }
});

export default router;
