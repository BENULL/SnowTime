import argparse
import json
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def save_png(src_path: Path, dst_path: Path) -> tuple[int, int]:
    with Image.open(src_path) as img:
        rgb = img.convert("RGBA")
        rgb.save(dst_path, format="PNG")
        return rgb.width, rgb.height


def extract_embedded_images(doc: fitz.Document, out_dir: Path) -> list[Path]:
    extracted = []
    seen = set()
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        for img in page.get_images(full=True):
            xref = img[0]
            if xref in seen:
                continue
            seen.add(xref)
            data = doc.extract_image(xref)
            ext = data.get("ext", "png")
            img_bytes = data["image"]
            out_path = out_dir / f"embedded_{xref}.{ext}"
            out_path.write_bytes(img_bytes)
            extracted.append(out_path)
    return extracted


def render_pages(doc: fitz.Document, out_dir: Path) -> list[Path]:
    rendered = []
    matrix = fitz.Matrix(2, 2)
    for page_index in range(len(doc)):
        page = doc.load_page(page_index)
        pix = page.get_pixmap(matrix=matrix, alpha=False)
        out_path = out_dir / f"page_{page_index + 1}.png"
        pix.save(out_path.as_posix())
        rendered.append(out_path)
    return rendered


def image_info(path: Path) -> dict:
    try:
        with Image.open(path) as img:
            w, h = img.size
    except Exception:
        return {"path": str(path), "width": 0, "height": 0, "area": 0, "ratio": 0}
    area = w * h
    ratio = w / h if h else 0
    return {
        "path": str(path),
        "width": w,
        "height": h,
        "area": area,
        "ratio": ratio,
    }


def pick_assets(infos: list[dict]) -> dict:
    if not infos:
        raise RuntimeError("No images found to select from.")

    infos_sorted = sorted(infos, key=lambda x: x["area"], reverse=True)
    board = infos_sorted[0]

    board_ratio = board["ratio"]
    card_sheet = None
    for candidate in infos_sorted[1:]:
        if abs(candidate["ratio"] - board_ratio) >= 0.15:
            card_sheet = candidate
            break
    if card_sheet is None and len(infos_sorted) > 1:
        card_sheet = infos_sorted[1]
    if card_sheet is None:
        card_sheet = board

    fruit = None
    fruit_candidates = [
        info for info in infos_sorted
        if 64 <= info["width"] <= 256
        and 64 <= info["height"] <= 256
        and 0.85 <= info["ratio"] <= 1.15
    ]
    if fruit_candidates:
        fruit = sorted(fruit_candidates, key=lambda x: x["area"])[0]

    return {
        "board": board,
        "card_sheet": card_sheet,
        "fruit": fruit,
    }


def crop_center_square(src_path: Path, dst_path: Path, size: int) -> tuple[int, int]:
    with Image.open(src_path) as img:
        w, h = img.size
        side = min(size, w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        crop = img.crop((left, top, left + side, top + side)).convert("RGBA")
        crop.save(dst_path, format="PNG")
        return crop.width, crop.height


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract boardgame assets from PDF.")
    parser.add_argument(
        "--pdf",
        default="notes/Snow_Time_Rules.pdf",
        help="Path to the PDF file.",
    )
    parser.add_argument(
        "--out",
        default="client/public/assets",
        help="Output directory for selected assets.",
    )
    args = parser.parse_args()

    pdf_path = Path(args.pdf).resolve()
    out_dir = Path(args.out).resolve()
    ensure_dir(out_dir)

    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    temp_root = Path.cwd() / "notes" / "_extract_tmp"
    temp_path = temp_root / "work"
    ensure_dir(temp_path)

    with fitz.open(pdf_path.as_posix()) as doc:
        extracted = extract_embedded_images(doc, temp_path)
        rendered = render_pages(doc, temp_path)

    candidates = extracted + rendered
    infos = []
    for candidate in candidates:
        info = image_info(candidate)
        if info["area"] > 0:
            infos.append(info)
    picks = pick_assets(infos)

    selection_log = {
        "board": picks["board"],
        "card_sheet": picks["card_sheet"],
        "fruit": picks["fruit"],
        "notes": [],
    }

    board_src = Path(picks["board"]["path"])
    card_src = Path(picks["card_sheet"]["path"])
    board_dst = out_dir / "board.png"
    card_dst = out_dir / "card-sheet.png"

    board_size = save_png(board_src, board_dst)
    card_size = save_png(card_src, card_dst)
    selection_log["board"]["selected_size"] = board_size
    selection_log["card_sheet"]["selected_size"] = card_size

    fruit_dst = out_dir / "fruit.png"
    if picks["fruit"]:
        fruit_src = Path(picks["fruit"]["path"])
        fruit_size = save_png(fruit_src, fruit_dst)
        selection_log["fruit"]["selected_size"] = fruit_size
    else:
        selection_log["notes"].append("Fruit icon not found; cropped from card sheet.")
        crop_size = min(256, max(64, min(card_size)))
        fruit_size = crop_center_square(card_dst, fruit_dst, crop_size)
        selection_log["fruit"] = {
            "path": str(card_dst),
            "width": card_size[0],
            "height": card_size[1],
            "area": card_size[0] * card_size[1],
            "ratio": card_size[0] / card_size[1] if card_size[1] else 0,
            "selected_size": fruit_size,
            "source": "cropped_from_card_sheet",
        }

    selection_path = out_dir / "selection.json"
    selection_path.write_text(json.dumps(selection_log, indent=2), encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
