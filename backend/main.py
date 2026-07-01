# ============================================================
# FastAPI Backend — Satellite Image Classifier + Deforestation Detection
# File: main.py
# Run: uvicorn main:app --reload
# ============================================================

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
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Satellite Image Classifier + Deforestation Detection API",
    description="Classifies land cover and detects deforestation by comparing before/after images",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---- Global state ----
MODEL      = None
CLASS_NAMES = []
DEVICE     = "cuda" if torch.cuda.is_available() else "cpu"

# ---- Static metadata ----
CLASS_DESCRIPTIONS = {
    "AnnualCrop":           "Fields replanted each season — wheat, corn, rice.",
    "Forest":               "Dense tree cover, closed canopy.",
    "HerbaceousVegetation": "Natural grasslands and meadows, non-crop ground cover.",
    "Highway":              "Major roads and highway corridors.",
    "Industrial":           "Factories, warehouses, power plants, commercial zones.",
    "Pasture":              "Land used for grazing livestock.",
    "PermanentCrop":        "Orchards, vineyards — crops that stay planted for years.",
    "Residential":          "Neighborhoods, housing developments, suburbs.",
    "River":                "Rivers and streams.",
    "SeaLake":              "Large bodies of water — sea or lake.",
}

DEFORESTATION_RISK = {
    "Forest":               "baseline",
    "AnnualCrop":           "high_risk",
    "Pasture":              "high_risk",
    "Industrial":           "high_risk",
    "Residential":          "medium_risk",
    "PermanentCrop":        "medium_risk",
    "HerbaceousVegetation": "low_risk",
    "Highway":              "low_risk",
    "River":                "low_risk",
    "SeaLake":              "low_risk",
}

# ============================================================
# DEFORESTATION COMPARISON LOGIC
# Maps (before_class, after_class) → result
# ============================================================
FOREST_CLASSES    = {"Forest"}
HIGH_RISK_CLASSES = {"AnnualCrop", "Pasture", "Industrial"}
MED_RISK_CLASSES  = {"Residential", "PermanentCrop"}

def compare_classes(before: str, after: str) -> dict:
    """
    Core deforestation logic.
    Takes before and after predicted class names.
    Returns a structured comparison result.
    """
    # Case 1: No change
    if before == after:
        return {
            "status":      "no_change",
            "status_label":"No Change Detected",
            "severity":    "none",
            "message":     f"Land cover remained {before} between the two periods.",
            "action":      "No intervention needed. Continue monitoring.",
        }

    # Case 2: Deforestation — was Forest, now something else
    if before in FOREST_CLASSES and after not in FOREST_CLASSES:
        if after in HIGH_RISK_CLASSES:
            severity = "critical"
            action   = "Immediate investigation recommended. High likelihood of illegal or intensive land conversion."
        elif after in MED_RISK_CLASSES:
            severity = "high"
            action   = "Flag for review. Urban or agricultural expansion detected."
        else:
            severity = "moderate"
            action   = "Monitor closely. Natural transition or low-intensity land use change."
        return {
            "status":      "deforestation_detected",
            "status_label":"⚠ Deforestation Detected",
            "severity":    severity,
            "message":     f"Forest cover lost — area changed from {before} to {after}.",
            "action":      action,
        }

    # Case 3: Reforestation — was not Forest, now Forest
    if before not in FOREST_CLASSES and after in FOREST_CLASSES:
        return {
            "status":      "reforestation_detected",
            "status_label":"✓ Reforestation Detected",
            "severity":    "positive",
            "message":     f"Forest cover gained — area changed from {before} to {after}.",
            "action":      "Positive land cover change. May indicate natural regrowth or active restoration.",
        }

    # Case 4: Land use change (non-forest to non-forest)
    if before in HIGH_RISK_CLASSES and after in MED_RISK_CLASSES:
        return {
            "status":      "land_use_change",
            "status_label":"Land Use Change",
            "severity":    "moderate",
            "message":     f"Non-forest land use changed from {before} to {after}.",
            "action":      "Monitor for further expansion toward forested areas.",
        }

    # Case 5: General land cover change
    return {
        "status":      "land_cover_change",
        "status_label":"Land Cover Change",
        "severity":    "low",
        "message":     f"Land cover changed from {before} to {after}. No direct forest loss detected.",
        "action":      "Low priority. Log and continue periodic monitoring.",
    }


# ---- Transform ----
TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225])
])


def build_model(num_classes: int) -> nn.Module:
    """
    Must match EXACTLY the architecture used in train_model.py.
    Training used ResNet50 with Dropout(0.3) + Linear head.
    """
    model = models.resnet50(pretrained=False)
    num_features = model.fc.in_features          # 2048
    model.fc = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(num_features, num_classes)
    )
    return model


@app.on_event("startup")
async def load_model():
    global MODEL, CLASS_NAMES
    MODEL_PATH = "eurosat_model_full.pth"
    try:
        checkpoint  = torch.load(MODEL_PATH, map_location=DEVICE)
        CLASS_NAMES = checkpoint["class_names"]
        num_classes = checkpoint["num_classes"]
        MODEL = build_model(num_classes)
        MODEL.load_state_dict(checkpoint["model_state_dict"])
        MODEL.to(DEVICE)
        MODEL.eval()
        logger.info(f"✅ Model loaded on {DEVICE} | Classes: {CLASS_NAMES}")
    except FileNotFoundError:
        logger.warning("⚠️  Model not found — running in dummy mode.")
        CLASS_NAMES = list(CLASS_DESCRIPTIONS.keys())
        MODEL = None


def predict_image(img: Image.Image):
    """Run inference. Returns (predicted_class, prob_dict)."""
    if MODEL is None:
        import random
        cls   = random.choice(CLASS_NAMES)
        probs = {c: round(float(np.random.dirichlet(np.ones(len(CLASS_NAMES)))[i]), 4)
                 for i, c in enumerate(CLASS_NAMES)}
        return cls, probs

    tensor = TRANSFORM(img.convert("RGB")).unsqueeze(0).to(DEVICE)
    with torch.no_grad():
        logits = MODEL(tensor)
        probs  = torch.softmax(logits, dim=1).squeeze().cpu().numpy()

    pred_idx   = int(np.argmax(probs))
    pred_class = CLASS_NAMES[pred_idx]
    prob_dict  = {CLASS_NAMES[i]: round(float(probs[i]), 4) for i in range(len(CLASS_NAMES))}
    return pred_class, prob_dict


def build_prediction_result(pred_class, prob_dict, filename):
    """Build a standard single-image result dict."""
    sorted_probs = dict(sorted(prob_dict.items(), key=lambda x: x[1], reverse=True))
    risk_key     = DEFORESTATION_RISK.get(pred_class, "low_risk")
    conf         = sorted_probs[pred_class]
    grade = (
        "A+" if conf >= 0.95 else
        "A"  if conf >= 0.85 else
        "B"  if conf >= 0.70 else
        "C"  if conf >= 0.55 else
        "D"  if conf >= 0.40 else "F"
    )
    return {
        "prediction":        pred_class,
        "confidence":        conf,
        "confidence_pct":    round(conf * 100, 1),
        "grade":             grade,
        "description":       CLASS_DESCRIPTIONS.get(pred_class, ""),
        "deforestation_risk": risk_key,
        "all_probabilities": sorted_probs,
        "filename":          filename,
    }


# ============================================================
# ROUTES
# ============================================================

@app.get("/")
def root():
    return {"message": "Satellite Deforestation Detection API v2.0 🚀", "device": DEVICE}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": MODEL is not None,
            "device": DEVICE, "classes": CLASS_NAMES}


# ---- Single image prediction ----
@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """Classify a single satellite image."""
    if file.content_type not in ["image/jpeg", "image/png", "image/jpg", "image/tiff"]:
        raise HTTPException(status_code=400, detail=f"Unsupported type: {file.content_type}")
    try:
        img = Image.open(io.BytesIO(await file.read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    pred_class, prob_dict = predict_image(img)
    return JSONResponse(build_prediction_result(pred_class, prob_dict, file.filename))


# ---- Deforestation comparison — MAIN NEW ENDPOINT ----
@app.post("/detect-deforestation")
async def detect_deforestation(
    before_image: UploadFile = File(..., description="Satellite image from earlier year (e.g. 2018)"),
    after_image:  UploadFile = File(..., description="Satellite image from later year (e.g. 2024)")
):
    """
    Upload two satellite images of the same area from different time periods.
    The model classifies both and returns a deforestation analysis.

    - before_image: earlier year image (e.g. 2018)
    - after_image:  later year image   (e.g. 2024)
    """
    ALLOWED = ["image/jpeg", "image/png", "image/jpg", "image/tiff"]

    if before_image.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="before_image: unsupported file type.")
    if after_image.content_type not in ALLOWED:
        raise HTTPException(status_code=400, detail="after_image: unsupported file type.")

    # Read both images
    try:
        img_before = Image.open(io.BytesIO(await before_image.read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read before_image: {e}")

    try:
        img_after = Image.open(io.BytesIO(await after_image.read())).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Cannot read after_image: {e}")

    # Classify both
    before_class, before_probs = predict_image(img_before)
    after_class,  after_probs  = predict_image(img_after)

    # Build per-image results
    before_result = build_prediction_result(before_class, before_probs, before_image.filename)
    after_result  = build_prediction_result(after_class,  after_probs,  after_image.filename)

    # Run deforestation comparison logic
    comparison = compare_classes(before_class, after_class)

    return JSONResponse({
        "before":      before_result,
        "after":       after_result,
        "comparison":  comparison,
        "summary": {
            "before_class":   before_class,
            "after_class":    after_class,
            "changed":        before_class != after_class,
            "status":         comparison["status"],
            "severity":       comparison["severity"],
            "before_confidence_pct": before_result["confidence_pct"],
            "after_confidence_pct":  after_result["confidence_pct"],
        }
    })


@app.get("/classes")
def get_classes():
    return {
        "classes": [
            {
                "name":              cls,
                "description":       CLASS_DESCRIPTIONS.get(cls, ""),
                "deforestation_risk": DEFORESTATION_RISK.get(cls, ""),
            }
            for cls in CLASS_NAMES
        ]
    }