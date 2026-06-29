# Run: uvicorn main:app --reload

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import torch
import torch.nn as nn
import torchvision.models as models
from torchvision import transforms
from PIL import Image
import io
import base64
import numpy as np
from typing import Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Satellite Image Classifier API",
    description="Detects land cover type from satellite images using ResNet50 trained on EuroSAT",
    version="1.0.0"
)

# ---- CORS — allow React frontend ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Global model state ----
MODEL = None
CLASS_NAMES = []
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ---- Land type descriptions for UI ----
CLASS_DESCRIPTIONS = {
    "AnnualCrop":              "Fields replanted each season — wheat, corn, rice.",
    "Forest":                  "Dense tree cover, closed canopy.",
    "HerbaceousVegetation":    "Natural grasslands and meadows, non-crop ground cover.",
    "Highway":                 "Major roads and highway corridors.",
    "Industrial":              "Factories, warehouses, power plants, commercial zones.",
    "Pasture":                 "Land used for grazing livestock.",
    "PermanentCrop":           "Orchards, vineyards — crops that stay planted for years.",
    "Residential":             "Neighborhoods, housing developments, suburbs.",
    "River":                   "Rivers and streams.",
    "SeaLake":                 "Large bodies of water — sea or lake.",
}

# ---- Deforestation risk mapping ----
DEFORESTATION_RISK = {
    "Forest":                  "baseline",
    "AnnualCrop":              "high_risk",    # former forest likely converted
    "Pasture":                 "high_risk",
    "Industrial":              "high_risk",
    "Residential":             "medium_risk",
    "PermanentCrop":           "medium_risk",
    "HerbaceousVegetation":    "low_risk",
    "Highway":                 "low_risk",
    "River":                   "low_risk",
    "SeaLake":                 "low_risk",
}

DEFORESTATION_LABELS = {
    "baseline":    "Forest (Baseline)",
    "high_risk":   "High Deforestation Risk",
    "medium_risk": "Medium Deforestation Risk",
    "low_risk":    "Low / No Risk",
}

# ---- Image preprocessing ----
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])


def build_model(num_classes: int) -> nn.Module:
    """Rebuild ResNet50 architecture with the same head as during training."""
    model = models.resnet50(pretrained=False)
    num_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(num_features, num_classes)
    )
    return model


@app.on_event("startup")
async def load_model():
    """Load model once when the server starts."""
    global MODEL, CLASS_NAMES
    MODEL_PATH = "eurosat_model_full.pth"   # put your .pth file next to main.py

    try:
        checkpoint = torch.load(MODEL_PATH, map_location=DEVICE)
        CLASS_NAMES = checkpoint["class_names"]
        num_classes = checkpoint["num_classes"]

        MODEL = build_model(num_classes)
        MODEL.load_state_dict(checkpoint["model_state_dict"])
        MODEL.to(DEVICE)
        MODEL.eval()
        logger.info(f"✅ Model loaded on {DEVICE} | Classes: {CLASS_NAMES}")
    except FileNotFoundError:
        logger.warning(f"⚠️  Model file '{MODEL_PATH}' not found. Using dummy model for dev.")
        # Fallback: dummy model so API doesn't crash during development
        CLASS_NAMES = list(CLASS_DESCRIPTIONS.keys())
        MODEL = None


def predict_image(img: Image.Image):
    """Run inference on a PIL image. Returns prediction dict."""
    if MODEL is None:
        # Dev mode — return random dummy result
        import random
        cls = random.choice(CLASS_NAMES)
        probs = {c: round(float(np.random.dirichlet(np.ones(len(CLASS_NAMES)))[i]), 4)
                 for i, c in enumerate(CLASS_NAMES)}
        return cls, probs

    tensor = TRANSFORM(img.convert("RGB")).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logits = MODEL(tensor)
        probs  = torch.softmax(logits, dim=1).squeeze().cpu().numpy()

    pred_idx  = int(np.argmax(probs))
    pred_class = CLASS_NAMES[pred_idx]
    prob_dict  = {CLASS_NAMES[i]: round(float(probs[i]), 4) for i in range(len(CLASS_NAMES))}

    return pred_class, prob_dict


# ============================================================
# ROUTES
# ============================================================

@app.get("/")
def root():
    return {"message": "Satellite Image Classifier API is running 🚀", "device": DEVICE}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": MODEL is not None,
        "device": DEVICE,
        "classes": CLASS_NAMES
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Upload a satellite image (JPG/PNG) and get the land cover classification.
    Returns top prediction, all class probabilities, and deforestation risk.
    """
    # Validate file type
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/tiff"]:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file.content_type}. Use JPG, PNG, or TIFF."
        )

    try:
        contents = await file.read()
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {str(e)}")

    pred_class, prob_dict = predict_image(img)

    # Sort probabilities descending
    sorted_probs = dict(
        sorted(prob_dict.items(), key=lambda x: x[1], reverse=True)
    )

    risk_key   = DEFORESTATION_RISK.get(pred_class, "low_risk")
    risk_label = DEFORESTATION_LABELS.get(risk_key, "Unknown")

    return JSONResponse({
        "prediction": pred_class,
        "confidence": sorted_probs[pred_class],
        "description": CLASS_DESCRIPTIONS.get(pred_class, ""),
        "deforestation_risk": risk_key,
        "deforestation_label": risk_label,
        "all_probabilities": sorted_probs,
        "filename": file.filename,
    })


@app.post("/predict/base64")
async def predict_base64(payload: dict):
    """
    Accept base64-encoded image string.
    Body: { "image": "<base64 string>", "filename": "optional.jpg" }
    """
    if "image" not in payload:
        raise HTTPException(status_code=400, detail="Missing 'image' field in body.")

    try:
        image_data = base64.b64decode(payload["image"])
        img = Image.open(io.BytesIO(image_data)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 image: {str(e)}")

    pred_class, prob_dict = predict_image(img)
    sorted_probs = dict(sorted(prob_dict.items(), key=lambda x: x[1], reverse=True))
    risk_key   = DEFORESTATION_RISK.get(pred_class, "low_risk")
    risk_label = DEFORESTATION_LABELS.get(risk_key, "Unknown")

    return JSONResponse({
        "prediction": pred_class,
        "confidence": sorted_probs[pred_class],
        "description": CLASS_DESCRIPTIONS.get(pred_class, ""),
        "deforestation_risk": risk_key,
        "deforestation_label": risk_label,
        "all_probabilities": sorted_probs,
        "filename": payload.get("filename", "uploaded_image"),
    })


@app.get("/classes")
def get_classes():
    """Return all land cover classes with descriptions."""
    return {
        "classes": [
            {
                "name": cls,
                "description": CLASS_DESCRIPTIONS.get(cls, ""),
                "deforestation_risk": DEFORESTATION_RISK.get(cls, ""),
                "risk_label": DEFORESTATION_LABELS.get(DEFORESTATION_RISK.get(cls, ""), "")
            }
            for cls in CLASS_NAMES
        ]
    }