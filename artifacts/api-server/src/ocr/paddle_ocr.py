import sys
import json
import base64
import os
import tempfile
import warnings
import logging
from contextlib import contextmanager

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_use_mkldnn"] = "0"

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

ocr_engine = None
paddle_ocr_class = None


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


def run_ocr(engine, image_path):
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


def safe_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


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


def process_image(image_data_b64):
    img_bytes = base64.b64decode(image_data_b64)

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(img_bytes)
        tmp_path = f.name

    try:
        engine = get_engine()
        result = run_ocr(engine, tmp_path)

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
            "text": "\n".join(all_text_lines),
            "boxes": all_boxes,
        }
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    try:
        input_data = json.loads(sys.stdin.read())
        image_b64 = input_data.get("image", "")
        result = process_image(image_b64)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "text": "", "boxes": []}), flush=True)
