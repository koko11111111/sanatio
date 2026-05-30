"""
Download a sample from the CIFAKE dataset (real vs AI-generated images).
Dataset: yanbax/CIFAKE_autotrain_compatible on Hugging Face (100k images).
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image

# Avoid Hugging Face datasets pulling in broken torch installs on Windows.
os.environ.setdefault("DATASETS_DISABLE_PYTORCH", "1")


def download_sample(output_dir: Path, per_class: int) -> tuple[int, int]:
    try:
        from datasets import load_dataset
    except ImportError as exc:
        raise SystemExit(
            "Install dependencies first: python -m pip install datasets huggingface_hub pillow"
        ) from exc

    output_dir.mkdir(parents=True, exist_ok=True)
    real_dir = output_dir / "REAL"
    fake_dir = output_dir / "FAKE"
    real_dir.mkdir(exist_ok=True)
    fake_dir.mkdir(exist_ok=True)

    total = per_class * 2
    print(f"Downloading CIFAKE sample ({total} images) from Hugging Face…")

    ds = load_dataset(
        "yanbax/CIFAKE_autotrain_compatible",
        split=f"train[:{total}]",
    )

    real_count = 0
    fake_count = 0

    for row in ds:
        label = row.get("label")
        image = row.get("image")
        if image is None:
            continue

        if label == 0 and real_count < per_class:
            path = real_dir / f"real_{real_count:05d}.jpg"
            image.save(path, format="JPEG", quality=90)
            real_count += 1
        elif label == 1 and fake_count < per_class:
            path = fake_dir / f"fake_{fake_count:05d}.jpg"
            image.save(path, format="JPEG", quality=90)
            fake_count += 1

        if real_count >= per_class and fake_count >= per_class:
            break

        if (real_count + fake_count) % 200 == 0 and (real_count + fake_count) > 0:
            print(f"  saved REAL={real_count} FAKE={fake_count}")

    print(f"Done. REAL={real_count}, FAKE={fake_count} -> {output_dir}")
    return real_count, fake_count


def main() -> None:
    parser = argparse.ArgumentParser(description="Download CIFAKE sample images")
    parser.add_argument("--output", default="ml/data/cifake_sample", help="Output folder")
    parser.add_argument("--per-class", type=int, default=4000, help="Images per class")
    args = parser.parse_args()
    download_sample(Path(args.output), args.per_class)


if __name__ == "__main__":
    main()
