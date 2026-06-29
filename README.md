# Satellite-Image-Classifier-and-Detect-Deforestation# 🛰️ 

ResNet50 + EuroSAT → FastAPI backend → React frontend  
**Land Cover Classification + Deforestation Detection**

---

## Project Structure

```
project/
├── train_model.py         ← Run in Google Colab (GPU)
├── backend/
│   ├── main.py            ← FastAPI server
│   ├── requirements.txt
│   └── eurosat_model_full.pth   ← Place your trained model here
└── frontend/
    └── src/
        └── App.jsx        ← React single-file UI
```

---

## Step 1 — Train the Model (Google Colab)

1. Go to **colab.research.google.com** → New Notebook
2. Runtime → Change Runtime Type → **T4 GPU** → Save
3. Upload `train_model.py` content into a code cell
4. Upload EuroSAT_RGB to Google Drive
5. Run all cells — takes ~25 min
6. Download `eurosat_model_full.pth` from your Drive

**Expected results:**
- Phase 1 (10 epochs): ~91–95% validation accuracy
- Phase 2 fine-tune (5 epochs): ~95–98% validation accuracy

---

## Step 2 — Run FastAPI Backend

```bash
cd backend

# Create virtual env
python -m venv venv
venv\Scripts\activate       # Windows PowerShell
# source venv/bin/activate  # Mac/Linux

# Install dependencies
pip install -r requirements.txt

# Place your model file here
# backend/eurosat_model_full.pth

# Run server
uvicorn main:app --reload --port 8000
```

API is now live at: http://localhost:8000  
Swagger docs at:   http://localhost:8000/docs

### API Endpoints

| Method | Endpoint          | Description                        |
|--------|-------------------|------------------------------------|
| GET    | /                 | Health check                       |
| GET    | /health           | Model status                       |
| GET    | /classes          | All 10 classes with descriptions   |
| POST   | /predict          | Upload image file → prediction     |
| POST   | /predict/base64   | Base64 image → prediction          |

### Test the API with curl

```bash
curl -X POST "http://localhost:8000/predict" \
     -H "accept: application/json" \
     -F "file=@path/to/your/image.jpg"
```

---

## Step 3 — Run React Frontend

```bash
cd frontend

# Create Vite + React project
npm create vite@latest . -- --template react
# Select: React → JavaScript

# Install deps
npm install

# Replace src/App.jsx with the provided App.jsx

# Run dev server
npm run dev
```

Frontend is at: http://localhost:5173

---

## API Response Format

```json
{
  "prediction": "Forest",
  "confidence": 0.9832,
  "description": "Dense tree cover, closed canopy.",
  "deforestation_risk": "baseline",
  "deforestation_label": "Forest (Baseline)",
  "all_probabilities": {
    "Forest": 0.9832,
    "HerbaceousVegetation": 0.0091,
    "Pasture": 0.0043,
    ...
  },
  "filename": "sentinel_patch.jpg"
}
```

---

## Deforestation Detection Workflow

1. Download Sentinel-2 imagery for a region from **Copernicus** or **Google Earth Engine**
2. Chop into 64×64 pixel patches
3. Run all patches through `/predict` for two time periods (e.g. 2018 and 2024)
4. Compare: patches that changed from `Forest` → `AnnualCrop / Pasture / Industrial` = **deforestation detected**
5. Validate against **Global Forest Watch** data

---

## Model Architecture

```
ResNet50 (pretrained on ImageNet)
  → All layers frozen during Phase 1
  → Final FC layer replaced: Linear(2048 → 10)
  → Dropout(0.3) added before FC
  → Phase 2: All layers unfrozen, fine-tuned at lr=0.0001
```

---

## Troubleshooting

**Model file not found on startup:**  
→ Place `eurosat_model_full.pth` in the `backend/` folder  
→ The API runs in "dummy mode" without it (returns random predictions)

**CORS error in frontend:**  
→ Add your frontend URL to `allow_origins` in `main.py`

**CUDA not available:**  
→ The model automatically falls back to CPU — slower but works

**Image too small/large:**  
→ Any size works — the transform resizes to 224×224 automatically
