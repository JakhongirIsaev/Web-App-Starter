import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { spawn } from "child_process";
import path from "path";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

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

router.get("/storage/file", requireAuth, async (req: Request, res: Response) => {
  const objectPath = req.query.path;
  if (typeof objectPath !== "string" || !objectPath) {
    res.status(400).json({ error: "Missing object path" });
    return;
  }

  try {
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
    const scriptPath = path.resolve(
      process.cwd(),
      "src/ocr/paddle_ocr.py"
    );

    const result = await new Promise<any>((resolve, reject) => {
      const gccLibPath = "/nix/store/bmi5znnqk4kg2grkrhk6py0irc8phf6l-gcc-14.2.1.20250322-lib/lib";
      const existingLdPath = process.env["LD_LIBRARY_PATH"] || "";
      const proc = spawn("python3", [scriptPath], {
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
          logger.error({ stderr }, "PaddleOCR stderr");
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
    logger.error({ err: error }, "OCR error");
    res.status(500).json({ error: error.message || "OCR processing failed" });
  }
});

export default router;
