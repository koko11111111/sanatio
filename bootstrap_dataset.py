"""
Bootstrap training data when CIFAKE download is slow/unavailable.
REAL  = CIFAR-10 photos (same source as CIFAKE real class)
FAKE  = stylized variants (placeholder until full CIFAKE download completes)
"""
from __future__ import annotations

import argparse
import pickle
import tarfile
import urllib.request
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter, ImageOps


CIFAR_URL = "https://www.cs.toronto.edu/~kriz/cifar-10-python.tar.gz"


def _unpickle_file(path: Path) -> dict:
    with path.open("rb") as handle:
        return pickle.load(handle, encoding="bytes")


def _safe_extractall(tar: tarfile.TarFile, dest: Path) -> None:
    """Extract a tar archive while preventing path traversal (Zip Slip)."""
    dest_resolved = dest.resolve()
    for member in tar.getmembers():
        member_path = (dest / member.name).resolve()
        if not str(member_path).startswith(str(dest_resolved)):
            raise ValueError(f"Unsafe tar entry rejected (path traversal): {member.name}")
    tar.extractall(dest)


def download_cifar10(cache_dir: Path) -> Path:
    cache_dir.mkdir(parents=True, exist_ok=True)
    tar_path = cache_dir / "cifar-10-python.tar.gz"
    extract_dir = cache_dir / "cifar-10-batches-py"

    if not extract_dir.exists():
        if not tar_path.exists():
            print("Downloading CIFAR-10 (~170 MB)…")
            urllib.request.urlretrieve(CIFAR_URL, tar_path)
        print("Extracting CIFAR-10…")
        with tarfile.open(tar_path, "r:gz") as tar:
            _safe_extractall(tar, cache_dir)

    return extract_dir


def load_cifar_images(extract_dir: Path, limit: int) -> list[Image.Image]:
    images: list[Image.Image] = []
    for batch_idx in range(1, 6):
        batch_path = extract_dir / f"data_batch_{batch_idx}"
        batch = _unpickle_file(batch_path)
        data = batch[b"data"]
        for row in data:
            arr = np.array(row, dtype=np.uint8).reshape(3, 32, 32).transpose(1, 2, 0)
            images.append(Image.fromarray(arr, mode="RGB"))
            if len(images) >= limit:
                return images
    return images


def make_fake_variant(img: Image.Image, seed: int) -> Image.Image:
    rng = np.random.default_rng(seed)
    out = img.convert("RGB").resize((128, 128), Image.Resampling.BILINEAR)
    out = out.filter(ImageFilter.GaussianBlur(radius=0.6 + float(rng.random())))
    out = ImageOps.posterize(out, bits=5)
    arr = np.asarray(out, dtype=np.float32)
    arr += rng.normal(0, 6, arr.shape)
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, mode="RGB")


def build_bootstrap(output_dir: Path, per_class: int) -> tuple[int, int]:
    cache = output_dir.parent / "_cache"
    extract_dir = download_cifar10(cache)

    real_dir = output_dir / "REAL"
    fake_dir = output_dir / "FAKE"
    real_dir.mkdir(parents=True, exist_ok=True)
    fake_dir.mkdir(parents=True, exist_ok=True)

    print(f"Building bootstrap set ({per_class} per class)…")
    cifar = load_cifar_images(extract_dir, per_class)

    for i, img in enumerate(cifar):
        img.resize((128, 128), Image.Resampling.LANCZOS).save(real_dir / f"real_{i:05d}.jpg", quality=92)
        make_fake_variant(img, seed=i).save(fake_dir / f"fake_{i:05d}.jpg", quality=92)

    print(f"Bootstrap ready REAL={len(cifar)} FAKE={len(cifar)}")
    return len(cifar), len(cifar)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="ml/data/cifake_sample")
    parser.add_argument("--per-class", type=int, default=2500)
    args = parser.parse_args()
    build_bootstrap(Path(args.output), args.per_class)


if __name__ == "__main__":
    main()
