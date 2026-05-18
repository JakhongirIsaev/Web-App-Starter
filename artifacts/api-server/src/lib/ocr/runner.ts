// artifacts/api-server/src/lib/ocr/runner.ts
//
// Centralised Tesseract OCR subprocess runner.
//
// Both /ocr/health and /ocr/recognize in routes/storage.ts used to spawn the
// same Python script with near-identical bookkeeping (timeout, stdout/stderr
// buffering, JSON.parse, kill-on-timeout). This module owns that mechanics so
// the route handlers stay thin and the spawn dance is unit-testable in
// isolation.
//
// The script path + per-call timeout default come from environment variables
// (OCR_GCC_LIB_PATH, OCR_TIMEOUT_MS) so the runner is config-free.

import { spawn } from "child_process";
import path from "node:path";
import { logger } from "../logger";

/** Where the Python OCR runner lives, relative to the api-server working dir. */
export function getOcrScriptPath(): string {
  return path.resolve(process.cwd(), "src/ocr/tesseract_ocr.py");
}

/** Default per-call wall-clock budget for the Tesseract spawn. */
export function getOcrTimeoutMs(): number {
  const configured = Number(process.env.OCR_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 90_000;
}

/** Failure modes that callers may want to map to specific HTTP responses / i18n strings. */
export type OcrFailureKind =
  | "timeout"
  | "process_exit"   // non-zero exit from the Python subprocess
  | "spawn_error"    // OS-level spawn failure (ENOENT etc.)
  | "parse_error";   // subprocess returned non-JSON on stdout

/** Typed error so route handlers can `instanceof` it instead of regex-matching messages. */
export class OcrFailureError extends Error {
  readonly kind: OcrFailureKind;
  readonly exitCode?: number;
  readonly stderr?: string;
  constructor(kind: OcrFailureKind, message: string, opts?: { exitCode?: number; stderr?: string }) {
    super(message);
    this.name = "OcrFailureError";
    this.kind = kind;
    this.exitCode = opts?.exitCode;
    this.stderr = opts?.stderr;
  }
}

export interface RunOcrSubprocessOptions {
  /** Extra CLI args for the Python script (e.g. ["--health"]). Default: []. */
  args?: string[];
  /** Optional stdin payload (typically `JSON.stringify({ image: base64 })`). */
  stdin?: string;
  /** Wall-clock budget in ms. Default: `getOcrTimeoutMs()`. */
  timeoutMs?: number;
  /**
   * Optional extra LD_LIBRARY_PATH prefix. Concatenated with any existing
   * LD_LIBRARY_PATH from process.env. Only relevant on Linux deploys (Railway
   * Nixpacks) where libgcc_s lives under a content-addressed path.
   */
  extraLibPath?: string;
}

/** What every Python OCR subprocess returns on stdout (parsed JSON). */
export type OcrSubprocessResult = unknown;

/**
 * Spawn the Tesseract Python runner with the supplied args / stdin, enforce a
 * wall-clock timeout, and return the parsed JSON from stdout.
 *
 * Throws `OcrFailureError` with a typed `kind` on any failure path.
 */
export function runOcrSubprocess(opts: RunOcrSubprocessOptions = {}): Promise<OcrSubprocessResult> {
  const scriptPath = getOcrScriptPath();
  const args = opts.args ?? [];
  const timeoutMs = opts.timeoutMs ?? getOcrTimeoutMs();
  const extraLibPath = opts.extraLibPath ?? process.env["OCR_GCC_LIB_PATH"] ?? "";
  const existingLdPath = process.env["LD_LIBRARY_PATH"] ?? "";
  const ldLibraryPath = [extraLibPath, existingLdPath]
    .filter((segment) => segment && segment.length > 0)
    .join(":");

  return new Promise<OcrSubprocessResult>((resolve, reject) => {
    const proc = spawn("python3", [scriptPath, ...args], {
      env: {
        ...process.env,
        ...(ldLibraryPath ? { LD_LIBRARY_PATH: ldLibraryPath } : {}),
      },
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (err?: OcrFailureError, value?: OcrSubprocessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (err) {
        reject(err);
        return;
      }
      resolve(value);
    };

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(new OcrFailureError("timeout", `OCR subprocess timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code: number | null) => {
      const exitCode = code ?? -1;
      if (exitCode !== 0) {
        logger.error({ stderr, exitCode, args }, "OCR subprocess non-zero exit");
        finish(
          new OcrFailureError("process_exit", `OCR subprocess exited with code ${exitCode}`, {
            exitCode,
            stderr,
          }),
        );
        return;
      }
      if (stderr.trim()) {
        logger.warn({ stderr, args }, "OCR subprocess stderr (exit 0)");
      }
      try {
        finish(undefined, JSON.parse(stdout));
      } catch {
        finish(new OcrFailureError("parse_error", "OCR subprocess returned non-JSON stdout", { stderr }));
      }
    });

    proc.on("error", (error: Error) => {
      finish(new OcrFailureError("spawn_error", error.message, { stderr }));
    });

    if (opts.stdin !== undefined) {
      proc.stdin.write(opts.stdin);
    }
    proc.stdin.end();
  });
}

/** Convenience: run the health probe (`python3 tesseract_ocr.py --health`). */
export function runOcrHealthcheck(timeoutMs = 10_000): Promise<OcrSubprocessResult> {
  return runOcrSubprocess({ args: ["--health"], timeoutMs });
}

/** Convenience: recognize a base64-encoded image. Wraps stdin payload. */
export function runOcrRecognize(base64Image: string): Promise<OcrSubprocessResult> {
  return runOcrSubprocess({ stdin: JSON.stringify({ image: base64Image }) });
}
