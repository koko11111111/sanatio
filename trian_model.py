import os
import cv2
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, random_split
from torchvision import models
import numpy as np
from tqdm import tqdm
from pathlib import Path

REAL_FOLDER_NAME = 'real'   
FAKE_FOLDER_NAME = 'fake'   
IMAGE_SIZE = 224             
BATCH_SIZE = 4  
EPOCHS = 5
LEARNING_RATE = 0.001

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Using device: {device}")

class AIDetectorDataset(Dataset):
    def __init__(self, real_dir, fake_dir, image_size=224):
        self.image_paths = []
        self.labels = []
        self.image_size = image_size
        valid_extensions = ('.jpg', '.jpeg', '.png', '.jfif', '.webp')

        print("Scanning 'real' folder and subfolders...")
        for root, dirs, files in os.walk(real_dir):
            for filename in files:
                if filename.lower().endswith(valid_extensions):
                    full_path = Path(root) / filename
                    self.image_paths.append(full_path)
                    self.labels.append(0)  

        print("Scanning 'fake' folder...")
        for root, dirs, files in os.walk(fake_dir):
            for filename in files:
                if filename.lower().endswith(valid_extensions):
                    full_path = Path(root) / filename
                    self.image_paths.append(full_path)
                    self.labels.append(1)  

        print(f"Total images found: {len(self.image_paths)}")

    def __len__(self):
        return len(self.image_paths)

    def __getitem__(self, idx):
        img_path = self.image_paths[idx]
        label = self.labels[idx]
        
        try:
            img_array = np.fromfile(str(img_path), np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            
            if img is None:
                img = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
            else:
                img = cv2.resize(img, (self.image_size, self.image_size))
        except Exception:
            img = np.zeros((self.image_size, self.image_size, 3), dtype=np.uint8)
            
        img = img.astype(np.float32) / 255.0
        img = np.transpose(img, (2, 0, 1))
        
        return torch.tensor(img, dtype=torch.float32), torch.tensor(label, dtype=torch.long)

full_dataset = AIDetectorDataset(REAL_FOLDER_NAME, FAKE_FOLDER_NAME, IMAGE_SIZE)

if len(full_dataset) == 0:
    print("Process failed: No valid images found. Check folder contents.")
    exit()

train_size = int(0.8 * len(full_dataset))
test_size = len(full_dataset) - train_size
train_dataset, test_dataset = random_split(full_dataset, [train_size, test_size])

train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True, num_workers=0)
test_loader = DataLoader(test_dataset, batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

print(f"Training set size: {train_size} | Testing set size: {test_size}")

print("Initializing AI model (ResNet18)...")
model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
num_features = model.fc.in_features
model.fc = nn.Linear(num_features, 2) 
model = model.to(device)

criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=LEARNING_RATE)

print("Starting training process...")
for epoch in range(EPOCHS):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    progress_bar = tqdm(train_loader, desc=f"Epoch {epoch+1}/{EPOCHS}", unit="batch")
    
    for images, labels in progress_bar:
        images, labels = images.to(device), labels.to(device)
        
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item() * images.size(0)
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
        
        current_loss = loss.item()
        progress_bar.set_postfix(Loss=f"{current_loss:.4f}")
        
    epoch_loss = running_loss / train_size
    epoch_acc = (correct / total) * 100
    print(f"\n[Summary] Epoch [{epoch+1}/{EPOCHS}] - Average Loss: {epoch_loss:.4f} - Accuracy: {epoch_acc:.2f}%\n")

MODEL_NAME = "ai_detector_model.pth"
torch.save(model.state_dict(), MODEL_NAME)
print(f"Success! Model trained and saved as: {MODEL_NAME}")
