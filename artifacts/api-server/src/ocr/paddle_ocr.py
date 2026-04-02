import sys
import json
import base64
import os
import tempfile
import warnings
import logging

os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"
os.environ["FLAGS_use_mkldnn"] = "0"

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

old_stdout = sys.stdout
old_stderr = sys.stderr
sys.stdout = open(os.devnull, 'w')
sys.stderr = open(os.devnull, 'w')

from paddleocr import PaddleOCR

sys.stdout = old_stdout
sys.stderr = old_stderr

ocr_engine = None

def get_engine():
    global ocr_engine
    if ocr_engine is None:
        old_out = sys.stdout
        old_err = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        try:
            ocr_engine = PaddleOCR(
                lang="ru",
                show_log=False,
                use_angle_cls=True,
                use_gpu=False,
            )
        finally:
            sys.stdout = old_out
            sys.stderr = old_err
    return ocr_engine

def process_image(image_data_b64):
    img_bytes = base64.b64decode(image_data_b64)

    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(img_bytes)
        tmp_path = f.name

    try:
        engine = get_engine()

        old_out = sys.stdout
        old_err = sys.stderr
        sys.stdout = open(os.devnull, 'w')
        sys.stderr = open(os.devnull, 'w')
        try:
            result = engine.ocr(tmp_path, cls=True)
        finally:
            sys.stdout = old_out
            sys.stderr = old_err

        all_text_lines = []
        all_boxes = []

        if result and result[0]:
            for line in result[0]:
                text = line[1][0]
                confidence = float(line[1][1])
                all_text_lines.append(text)
                all_boxes.append({
                    "text": text,
                    "confidence": confidence,
                })

        full_text = "\n".join(all_text_lines)

        return {
            "success": True,
            "text": full_text,
            "boxes": all_boxes,
        }
    finally:
        os.unlink(tmp_path)


if __name__ == "__main__":
    input_data = json.loads(sys.stdin.read())
    image_b64 = input_data.get("image", "")

    try:
        result = process_image(image_b64)
        print(json.dumps(result), flush=True)
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e), "text": "", "boxes": []}), flush=True)
