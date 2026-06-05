import os
import cv2
import numpy as np
from sklearn.model_selection import train_test_split

REAL_FOLDER_NAME = 'real'
FAKE_FOLDER_NAME = 'fake'
IMAGE_SIZE = 224
SAMPLE_LIMIT = 20000


def load_images_from_folder(folder_name: str, label_value: int) -> tuple[list, list]:
    """Load up to SAMPLE_LIMIT images from a folder.

    Files are sorted before slicing so sampling is deterministic across
    operating systems and repeated runs.
    """
    print(f"Loading images from folder: '{folder_name}'...")
    if not os.path.exists(folder_name):
        print(f"Error: Folder '{folder_name}' not found!")
        return [], []

    # Sort for deterministic order regardless of OS or filesystem
    all_files = sorted(os.listdir(folder_name))
    sampled_files = all_files[:SAMPLE_LIMIT]

    X: list = []
    y: list = []
    count = 0

    for filename in sampled_files:
        if filename.lower().endswith(('.jpg', '.jpeg', '.png', '.jfif', '.webp')):
            img_path = os.path.join(folder_name, filename)
            img = cv2.imread(img_path)
            if img is not None:
                img_resized = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
                img_normalized = img_resized / 255.0
                X.append(img_normalized)
                y.append(label_value)
                count += 1

    print(f"Successfully loaded {count} images from '{folder_name}'")
    return X, y


def main() -> None:
    X_real, y_real = load_images_from_folder(REAL_FOLDER_NAME, label_value=0)
    X_fake, y_fake = load_images_from_folder(FAKE_FOLDER_NAME, label_value=1)

    X_data = X_real + X_fake
    y_labels = y_real + y_fake

    if len(X_data) == 0:
        print("Process failed: No valid images found. Check folder contents.")
        return

    X_data = np.array(X_data)
    y_labels = np.array(y_labels)

    print("\n--- Final Data Analysis Summary ---")
    print(f"Total processed images: {len(X_data)}")
    print(f"Images array shape: {X_data.shape}")
    print(f"Labels array shape: {y_labels.shape}")

    print("Splitting data into 80% Training and 20% Testing...")
    X_train, X_test, y_train, y_test = train_test_split(
        X_data, y_labels, test_size=0.2, random_state=42
    )
    print(f"Success! Training set size: {len(X_train)} | Testing set size: {len(X_test)}")


if __name__ == "__main__":
    main()
