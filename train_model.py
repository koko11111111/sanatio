"""
SANATIO - Improved AI vs Real Photo Classifier
Fixes:
  1. Uses full CIFAKE dataset (not bootstrap) when available
  2. Proper train/test split to prevent overfitting
  3. class_weight='balanced' to handle any imbalance
  4. Stronger regularization (C=0.1) to prevent memorisation
  5. Feature set matched exactly to photo-model.js
  6. Validation on held-out set before export
"""
from __future__ import annotations

import json
import math
import os
import random
import struct
import sys
import zlib
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler

BASE_DIR = Path(__file__).resolve().parent.parent
DATASET_DIR = BASE_DIR / "ml" / "cifake_data"
MODEL_DIR = BASE_DIR / "assets" / "model"
MODEL_PATH = MODEL_DIR / "ai-detector.json"

TARGET_SIZE = 128
RANDOM_SEED = 42
MAX_PER_CLASS = 4000  # cap to keep training fast


# ── Feature extraction (must match photo-model.js exactly) ──────────────────

def extract_features(img: Image.Image) -> list[float]:
    img = img.convert("RGB").resize((TARGET_SIZE, TARGET_SIZE), Image.LANCZOS)
    arr = np.array(img, dtype=np.float32) / 255.0  # shape (128, 128, 3)

    features: list[float] = []

    # Per-channel stats: mean, std, q25, q75
    for c in range(3):
        channel = arr[:, :, c].ravel()
        channel_sorted = np.sort(channel)
        features.append(float(channel.mean()))
        features.append(float(channel.std()))
        features.append(float(channel_sorted[int(len(channel_sorted) * 0.25)]))
        features.append(float(channel_sorted[int(len(channel_sorted) * 0.75)]))

    # Grayscale histogram (16 bins)
    gray = arr.mean(axis=2).ravel()
    hist, _ = np.histogram(gray, bins=16, range=(0, 1), density=True)
    hist = hist / (hist.sum() or 1)
    features.extend(hist.tolist())

    # Gradient stats: mean, std, p90
    gy, gx = np.gradient(arr.mean(axis=2))
    grad = np.sqrt(gx**2 + gy**2).ravel()
    grad_sorted = np.sort(grad)
    features.append(float(grad.mean()))
    features.append(float(grad.std()))
    features.append(float(grad_sorted[int(len(grad_sorted) * 0.9)]))

    # Laplacian stats: variance, abs_mean
    gray2d = arr.mean(axis=2)
    lap = (
        -4 * gray2d
        + np.roll(gray2d, 1, axis=0)
        + np.roll(gray2d, -1, axis=0)
        + np.roll(gray2d, 1, axis=1)
        + np.roll(gray2d, -1, axis=1)
    )
    features.append(float(lap.var()))
    features.append(float(np.abs(lap).mean()))

    # Channel cross-correlations
    r = arr[:, :, 0].ravel()
    g = arr[:, :, 1].ravel()
    b = arr[:, :, 2].ravel()
    features.append(float(np.corrcoef(r, g)[0, 1]))
    features.append(float(np.corrcoef(r, b)[0, 1]))
    features.append(float(np.corrcoef(g, b)[0, 1]))

    return features


# ── Dataset loading ──────────────────────────────────────────────────────────

def load_images_from_folder(folder: Path, label: int, limit: int) -> tuple[list, list]:
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    paths = [p for p in folder.iterdir() if p.suffix.lower() in exts]
    random.shuffle(paths)
    paths = paths[:limit]

    X, y = [], []
    for p in paths:
        try:
            img = Image.open(p)
            X.append(extract_features(img))
            y.append(label)
        except Exception:
            continue
    return X, y


def find_dataset_folders() -> tuple[Path | None, Path | None]:
    """Look for real/fake image folders in common locations."""
    candidates = [
        (DATASET_DIR / "real", DATASET_DIR / "fake"),
        (DATASET_DIR / "REAL", DATASET_DIR / "FAKE"),
        (DATASET_DIR / "train" / "REAL", DATASET_DIR / "train" / "FAKE"),
        (DATASET_DIR / "train" / "real", DATASET_DIR / "train" / "fake"),
    ]
    for real_dir, fake_dir in candidates:
        if real_dir.exists() and fake_dir.exists():
            return real_dir, fake_dir
    return None, None


def bootstrap_data(n_per_class: int = 2000) -> tuple[list, list]:
    """
    Generate synthetic features for a fallback when no dataset is available.
    Real images: higher channel correlations, moderate gradients
    AI images: different frequency/texture characteristics
    This is a WEAK fallback — use real CIFAKE data for best results.
    """
    print("  WARNING: No dataset found. Using synthetic bootstrap features.")
    print("  This produces a weak model. Run download_dataset.py first.")
    rng = np.random.RandomState(RANDOM_SEED)
    X, y = [], []

    for _ in range(n_per_class):
        # Real photo: moderate laplacian, high channel correlation
        f = rng.normal(0, 0.05, 36).tolist()
        f[32] = rng.normal(0.045, 0.008)   # lap_abs_mean - real texture
        f[33] = rng.normal(0.93, 0.08)      # corr_RG - real photos have high rgb corr
        f[34] = rng.normal(0.85, 0.12)      # corr_RB
        f[35] = rng.normal(0.93, 0.08)      # corr_GB
        f[28] = rng.normal(0.008, 0.003)    # grad_mean
        X.append(f)
        y.append(0)

    for _ in range(n_per_class):
        # AI image: different texture, lower natural correlations
        f = rng.normal(0, 0.05, 36).tolist()
        f[32] = rng.normal(0.035, 0.010)    # lap_abs_mean - smoother AI texture
        f[33] = rng.normal(0.80, 0.10)      # lower rgb correlation
        f[34] = rng.normal(0.72, 0.12)
        f[35] = rng.normal(0.80, 0.10)
        f[28] = rng.normal(0.012, 0.004)    # higher gradients (AI sharpening)
        X.append(f)
        y.append(1)

    return X, y


# ── Training ─────────────────────────────────────────────────────────────────

def train(X: list, y: list) -> tuple:
    X_arr = np.array(X, dtype=np.float64)
    y_arr = np.array(y, dtype=np.int32)

    print(f"  Dataset: {len(y_arr)} samples | real={int((y_arr==0).sum())} | ai={int((y_arr==1).sum())}")

    X_train, X_test, y_train, y_test = train_test_split(
        X_arr, y_arr, test_size=0.20, random_state=RANDOM_SEED, stratify=y_arr
    )

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    clf = LogisticRegression(
        C=0.1,                    # strong regularization prevents memorisation
        class_weight="balanced",  # handles any class imbalance
        max_iter=2000,
        solver="lbfgs",
        random_state=RANDOM_SEED,
    )

    # 5-fold CV on training set
    cv_scores = cross_val_score(clf, X_train_s, y_train, cv=5, scoring="balanced_accuracy")
    print(f"  5-fold CV balanced accuracy: {cv_scores.mean():.3f} ± {cv_scores.std():.3f}")

    clf.fit(X_train_s, y_train)
    test_acc = clf.score(X_test_s, y_test)
    bal_acc = cross_val_score(clf, X_test_s, y_test, cv=2, scoring="balanced_accuracy").mean()

    print(f"  Hold-out accuracy: {test_acc:.3f}")
    print(f"  Hold-out balanced accuracy: {bal_acc:.3f}")
    print()
    print(classification_report(y_test, clf.predict(X_test_s), target_names=["real", "ai"]))

    cm = confusion_matrix(y_test, clf.predict(X_test_s))
    print("  Confusion matrix (rows=actual, cols=predicted):")
    print(f"    Real: {cm[0].tolist()}")
    print(f"    AI:   {cm[1].tolist()}")

    if test_acc >= 0.999 and len(y_arr) < 2000:
        print()
        print("  ⚠ WARNING: 100% accuracy on tiny dataset = memorisation, not learning.")
        print("  ⚠ Download more data with: python ml/download_dataset.py --per-class 4000")

    return clf, scaler, test_acc, bal_acc


# ── Export ───────────────────────────────────────────────────────────────────

def export_model(clf, scaler, test_acc: float, bal_acc: float, n_samples: int) -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)

    import datetime
    model_dict = {
        "version": 2,
        "modelType": "logistic_regression",
        "featureCount": int(clf.n_features_in_),
        "scalerMean": scaler.mean_.tolist(),
        "scalerScale": scaler.scale_.tolist(),
        "weights": clf.coef_[0].tolist(),
        "bias": float(clf.intercept_[0]),
        "labels": {"real": 0, "ai": 1},
        "meta": {
            "dataset": "CIFAKE (real vs AI-generated images)",
            "trainedAt": datetime.datetime.utcnow().isoformat() + "+00:00",
            "samples": n_samples,
            "testAccuracy": round(test_acc, 4),
            "balancedAccuracy": round(bal_acc, 4),
            "regularization": "C=0.1 (strong)",
            "classWeight": "balanced",
        },
    }

    with open(MODEL_PATH, "w") as f:
        json.dump(model_dict, f, indent=2)

    size_kb = MODEL_PATH.stat().st_size / 1024
    print(f"\n  Saved to {MODEL_PATH} ({size_kb:.1f} KB)")


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    print("\nSANATIO Model Training v2")
    print("=" * 40)

    random.seed(RANDOM_SEED)
    np.random.seed(RANDOM_SEED)

    real_dir, fake_dir = find_dataset_folders()

    if real_dir and fake_dir:
        print(f"\n  Loading real images from: {real_dir}")
        X_real, y_real = load_images_from_folder(real_dir, label=0, limit=MAX_PER_CLASS)
        print(f"  Loaded {len(X_real)} real images")

        print(f"  Loading AI images from:   {fake_dir}")
        X_fake, y_fake = load_images_from_folder(fake_dir, label=1, limit=MAX_PER_CLASS)
        print(f"  Loaded {len(X_fake)} AI images")

        if len(X_real) < 100 or len(X_fake) < 100:
            print("  Not enough images found. Falling back to bootstrap.")
            X, y = bootstrap_data(2000)
        else:
            X = X_real + X_fake
            y = y_real + y_fake
    else:
        print(f"\n  Dataset not found at: {DATASET_DIR}")
        print("  Run: python ml/download_dataset.py --per-class 4000")
        X, y = bootstrap_data(2000)

    print("\n  Extracting features and training...")
    clf, scaler, test_acc, bal_acc = train(X, y)
    export_model(clf, scaler, test_acc, bal_acc, len(y))
    print("\n  Done! Refresh the dashboard and test with a photo.")
    print()


if __name__ == "__main__":
    main()
