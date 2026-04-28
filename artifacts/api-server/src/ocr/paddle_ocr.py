"""OCR runner — Tesseract only.

Invoked by the API server as a Python subprocess. Two modes:
  python3 paddle_ocr.py --health        → JSON status, used by /api/ocr/health
  python3 paddle_ocr.py < {image: "b64"} → JSON OCR result, used by /api/ocr/recognize

PaddleOCR support was removed for image-size and attack-surface reasons; the
filename is kept to avoid churning the api-server build path.
"""
import sys
import json
import base64
import os
import tempfile
import subprocess
import shutil


def env_int(name, default):
    try:
        value = int(os.environ.get(name, default))
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


TESSERACT_TIMEOUT_SEC = env_int("TESSERACT_TIMEOUT_SEC", 45)


def result_from_text(text, confidence=0.0):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return {
        "success": True,
        "engine": "tesseract",
        "text": "\n".join(lines),
        "boxes": [{"text": line, "confidence": confidence} for line in lines],
    }


def tesseract_path():
    return shutil.which("tesseract")


def get_tesseract_languages():
    executable = tesseract_path()
    if not executable:
        return []

    try:
        completed = subprocess.run(
            [executable, "--list-langs"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except Exception:
        return []

    output = "\n".join([completed.stdout or "", completed.stderr or ""])
    languages = []
    for line in output.splitlines():
        value = line.strip()
        if not value or value.lower().startswith("list of available languages"):
            continue
        if " " in value:
            continue
        languages.append(value)
    return sorted(set(languages))


def choose_tesseract_language(languages):
    preferred = [lang for lang in ["rus", "eng"] if lang in languages]
    if preferred:
        return "+".join(preferred)
    if "eng" in languages:
        return "eng"
    if languages:
        return languages[0]
    return ""


def run_tesseract(image_path):
    executable = tesseract_path()
    if not executable:
        raise RuntimeError("tesseract executable is not installed")

    languages = get_tesseract_languages()
    language = choose_tesseract_language(languages)
    last_error = ""

    for psm in ["6", "3", "11"]:
        command = [executable, image_path, "stdout", "--psm", psm]
        if language:
            command.extend(["-l", language])

        completed = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=TESSERACT_TIMEOUT_SEC,
            check=False,
        )

        text = (completed.stdout or "").strip()
        if completed.returncode == 0 and text:
            return result_from_text(text)
        if completed.stderr:
            last_error = completed.stderr.strip()

    if last_error and "Error opening data file" in last_error:
        raise RuntimeError(last_error)

    return result_from_text("")


def process_image(image_data_b64):
    img_bytes = base64.b64decode(image_data_b64)
    if not img_bytes:
        raise ValueError("empty image payload")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(img_bytes)
        tmp_path = f.name

    try:
        return run_tesseract(tmp_path)
    finally:
        os.unlink(tmp_path)


def health_payload():
    languages = get_tesseract_languages()
    return {
        "success": True,
        "engine": "tesseract",
        "tesseract": {
            "available": bool(tesseract_path()),
            "path": tesseract_path(),
            "languages": languages,
            "selectedLanguage": choose_tesseract_language(languages),
        },
    }


if __name__ == "__main__":
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "--health":
            print(json.dumps(health_payload()), flush=True)
            sys.exit(0)

        input_data = json.loads(sys.stdin.read())
        image_b64 = input_data.get("image", "")
        result = process_image(image_b64)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "text": "", "boxes": []}), flush=True)
