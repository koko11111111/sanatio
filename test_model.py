import os
import cv2
import torch
import torch.nn as nn
import numpy as np
from torchvision import models

MODEL_PATH = "ai_detector_model.pth"
TEST_FOLDER_NAME = "test"
IMAGE_SIZE = 224

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

if not os.path.exists(MODEL_PATH):
    print(f"Error: Trained model file '{MODEL_PATH}' not found. Wait for training to finish.")
    exit()

print("Loading trained AI model...")
model = models.resnet18()
num_features = model.fc.in_features
model.fc = nn.Linear(num_features, 2)

model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
model = model.to(device)
model.eval()

if not os.path.exists(TEST_FOLDER_NAME):
    print(f"Error: Folder '{TEST_FOLDER_NAME}' not found!")
    exit()

test_files = os.listdir(TEST_FOLDER_NAME)
valid_extensions = ('.jpg', '.jpeg', '.png', '.jfif', '.webp')
image_files = [f for f in test_files if f.lower().endswith(valid_extensions)]

if len(image_files) == 0:
    print(f"No valid images found in '{TEST_FOLDER_NAME}' folder.")
    exit()

print(f"Found {len(image_files)} images to test.\n")
print("--- Batch Detection Results ---")

for filename in image_files:
    img_path = os.path.join(TEST_FOLDER_NAME, filename)
    
    try:
    
        img_array = np.fromfile(img_path, np.uint8)
        img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        
        if img is not None:
            img_resized = cv2.resize(img, (IMAGE_SIZE, IMAGE_SIZE))
            img_normalized = img_resized / 255.0
            
            img_input = np.transpose(img_normalized, (2, 0, 1))
            img_tensor = torch.tensor(img_input, dtype=torch.float32).unsqueeze(0).to(device)
            
            with torch.no_grad():
                outputs = model(img_tensor)
                probabilities = torch.softmax(outputs, dim=1)
                confidence, predicted = torch.max(probabilities, 1)
                
            real_score = probabilities[0][0].item() * 100
            ai_score = probabilities[0][1].item() * 100
            
            print(f"File: {filename}")
            if predicted.item() == 0:
                print(f"-> Prediction: REAL IMAGE (Confidence: {real_score:.2f}%)")
            else:
                print(f"-> Prediction: AI GENERATED (Confidence: {ai_score:.2f}%)")
            print(f"-> Full Breakdown - Real: {real_score:.1f}% | AI: {ai_score:.1f}%")
            print("-" * 40)
        else:
            print(f"Could not read file: {filename}")
            print("-" * 40)
    except Exception as e:
        print(f"Error processing file {filename}: {e}")
        print("-" * 40)
