import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { requireAuth } from "../middleware/auth";

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
    console.error("Error generating upload URL:", error);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/storage/objects/:objectPath", requireAuth, async (req: Request, res: Response) => {
  const objectPath = req.params.objectPath;
  if (!objectPath) {
    res.status(400).json({ error: "Missing object path" });
    return;
  }

  try {
    const readStream = await objectStorageService.getObjectEntityReadStream(objectPath);
    const metadata = await objectStorageService.getObjectEntityMetadata(objectPath);

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

export default router;
