"""
Extract image features for AI vs real classification.
Same logic is mirrored in photo-model.js for browser inference.
"""
from __future__ import annotations

import numpy as np
from PIL import Image


def _to_array(image: Image.Image, size: int = 128) -> np.ndarray:
    rgb = image.convert("RGB").resize((size, size), Image.Resampling.BILINEAR)
    return np.asarray(rgb, dtype=np.float32) / 255.0


def extract_features_from_array(arr: np.ndarray) -> np.ndarray:
    features: list[float] = []

    for channel in range(3):
        ch = arr[:, :, channel]
        features.extend(
            [
                float(ch.mean()),
                float(ch.std()),
                float(np.percentile(ch, 25)),
                float(np.percentile(ch, 75)),
            ]
        )

    gray = arr.mean(axis=2)
    hist, _ = np.histogram(gray, bins=16, range=(0.0, 1.0))
    hist = hist.astype(np.float64)
    total = hist.sum() or 1.0
    features.extend((hist / total).tolist())

    gx = np.diff(gray, axis=1, prepend=gray[:, :1])
    gy = np.diff(gray, axis=0, prepend=gray[:1, :])
    grad = np.sqrt(gx * gx + gy * gy)
    features.extend([float(grad.mean()), float(grad.std()), float(np.percentile(grad, 90))])

    lap = (
        -4.0 * gray
        + np.roll(gray, 1, axis=0)
        + np.roll(gray, -1, axis=0)
        + np.roll(gray, 1, axis=1)
        + np.roll(gray, -1, axis=1)
    )
    features.extend([float(lap.var()), float(np.abs(lap).mean())])

    # Color correlation on a downsampled grid (much faster than full resolution).
    step = 4
    r = arr[::step, ::step, 0].flatten()
    g = arr[::step, ::step, 1].flatten()
    b = arr[::step, ::step, 2].flatten()
    features.extend(
        [
            float(np.corrcoef(r, g)[0, 1]),
            float(np.corrcoef(r, b)[0, 1]),
            float(np.corrcoef(g, b)[0, 1]),
        ]
    )

    return np.asarray(features, dtype=np.float32)


def extract_features_from_path(path: str) -> np.ndarray:
    with Image.open(path) as img:
        return extract_features_from_array(_to_array(img))


def extract_features_from_pil(image: Image.Image) -> np.ndarray:
    return extract_features_from_array(_to_array(image))
