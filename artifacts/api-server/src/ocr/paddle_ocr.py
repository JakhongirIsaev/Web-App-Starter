import sys
import json
import base64
import os
import tempfile
import warnings
import logging
import subprocess
import shutil
import importlib.util
from contextlib import contextmanager

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_use_mkldnn"] = "0"

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

ocr_engine = None
paddle_ocr_class = None


def env_int(name, default):
    try:
        value = int(os.environ.get(name, default))
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default


DEFAULT_ENGINE = os.environ.get("OCR_ENGINE", "tesseract").strip().lower() or "tesseract"
TESSERACT_TIMEOUT_SEC = env_int("TESSERACT_TIMEOUT_SEC", 45)


@contextmanager
def quiet_output():
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    with open(os.devnull, "w") as devnull:
        sys.stdout = devnull
        sys.stderr = devnull
        try:
            yield
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def result_from_text(text, engine, confidence=0.0):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    return {
        "success": True,
        "engine": engine,
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
            return result_from_text(text, "tesseract", confidence=0.0)
        if completed.stderr:
            last_error = completed.stderr.strip()

    if last_error and "Error opening data file" in last_error:
        raise RuntimeError(last_error)

    return result_from_text("", "tesseract", confidence=0.0)


def get_paddle_ocr_class():
    global paddle_ocr_class
    if paddle_ocr_class is None:
        with quiet_output():
            from paddleocr import PaddleOCR

        paddle_ocr_class = PaddleOCR
    return paddle_ocr_class


def get_engine():
    global ocr_engine
    if ocr_engine is not None:
        return ocr_engine

    PaddleOCR = get_paddle_ocr_class()
    init_attempts = [
        {"lang": "ru", "show_log": False, "use_angle_cls": True, "use_gpu": False},
        {"lang": "ru", "use_angle_cls": True, "use_gpu": False},
        {"lang": "ru"},
    ]

    last_error = None
    for kwargs in init_attempts:
        try:
            with quiet_output():
                ocr_engine = PaddleOCR(**kwargs)
            return ocr_engine
        except (TypeError, ValueError) as exc:
            last_error = exc

    raise last_error or RuntimeError("Failed to initialize PaddleOCR")


def run_paddle_ocr(engine, image_path):
    if hasattr(engine, "ocr"):
        try:
            with quiet_output():
                return engine.ocr(image_path, cls=True)
        except (TypeError, ValueError):
            with quiet_output():
                return engine.ocr(image_path)

    if hasattr(engine, "predict"):
        with quiet_output():
            return engine.predict(image_path)

    raise RuntimeError("PaddleOCR engine has neither ocr() nor predict()")


def extract_old_style_line(value):
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None

    text_and_score = value[1]
    if (
        isinstance(text_and_score, (list, tuple))
        and len(text_and_score) >= 2
        and isinstance(text_and_score[0], str)
    ):
        return text_and_score[0], safe_float(text_and_score[1])

    if isinstance(value[0], str):
        return value[0], safe_float(value[1])

    return None


def iter_ocr_lines(value, depth=0):
    if value is None or depth > 8:
        return

    if hasattr(value, "to_dict"):
        yield from iter_ocr_lines(value.to_dict(), depth + 1)
        return

    if isinstance(value, dict):
        texts = value.get("rec_texts") or value.get("texts")
        scores = value.get("rec_scores") or value.get("scores") or []
        if isinstance(texts, list):
            for index, text in enumerate(texts):
                if text:
                    score = scores[index] if isinstance(scores, list) and index < len(scores) else 0.0
                    yield str(text), safe_float(score)
            return

        text = value.get("text") or value.get("rec_text")
        if isinstance(text, str) and text.strip():
            yield text, safe_float(value.get("score") or value.get("confidence"))
            return

        for nested in value.values():
            yield from iter_ocr_lines(nested, depth + 1)
        return

    old_style_line = extract_old_style_line(value)
    if old_style_line:
        yield old_style_line
        return

    if isinstance(value, (list, tuple)):
        for item in value:
            yield from iter_ocr_lines(item, depth + 1)


def run_paddle(image_path):
    engine = get_engine()
    result = run_paddle_ocr(engine, image_path)
    all_text_lines = []
    all_boxes = []

    for text, confidence in iter_ocr_lines(result):
        cleaned_text = text.strip()
        if not cleaned_text:
            continue
        all_text_lines.append(cleaned_text)
        all_boxes.append({
            "text": cleaned_text,
            "confidence": confidence,
        })

    return {
        "success": True,
        "engine": "paddleocr",
        "text": "\n".join(all_text_lines),
        "boxes": all_boxes,
    }


def engine_order():
    if DEFAULT_ENGINE == "paddle":
        return ["paddle"]
    if DEFAULT_ENGINE == "auto":
        return ["tesseract", "paddle"]
    return ["tesseract", "paddle"]


def process_image(image_data_b64):
    img_bytes = base64.b64decode(image_data_b64)
    if not img_bytes:
        raise ValueError("empty image payload")

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(img_bytes)
        tmp_path = f.name

    errors = []
    try:
        for engine in engine_order():
            try:
                if engine == "tesseract":
                    return run_tesseract(tmp_path)
                if engine == "paddle":
                    return run_paddle(tmp_path)
            except Exception as exc:
                errors.append(f"{engine}: {exc}")
                if DEFAULT_ENGINE != "auto":
                    continue

        raise RuntimeError("; ".join(errors) or "Matnni tanish xizmati topilmadi")
    finally:
        os.unlink(tmp_path)


def health_payload():
    languages = get_tesseract_languages()
    return {
        "success": True,
        "defaultEngine": DEFAULT_ENGINE,
        "tesseract": {
            "available": bool(tesseract_path()),
            "path": tesseract_path(),
            "languages": languages,
            "selectedLanguage": choose_tesseract_language(languages),
        },
        "paddleocr": {
            "installed": importlib.util.find_spec("paddleocr") is not None,
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
