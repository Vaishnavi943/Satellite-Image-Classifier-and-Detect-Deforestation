import { useState, useCallback, useRef } from "react";

const API_BASE = "http://localhost:8000";

// ---- Color maps ----
const RISK_COLORS = {
  baseline:    { bg: "#14532d", text: "#86efac", border: "#166534", badge: "Forest Baseline" },
  high_risk:   { bg: "#450a0a", text: "#fca5a5", border: "#7f1d1d", badge: "High Risk" },
  medium_risk: { bg: "#451a03", text: "#fdba74", border: "#7c2d12", badge: "Medium Risk" },
  low_risk:    { bg: "#082f49", text: "#7dd3fc", border: "#0c4a6e", badge: "Low Risk" },
};

const CLASS_ICONS = {
  Forest: "🌲", AnnualCrop: "🌾", HerbaceousVegetation: "🌿",
  Highway: "🛣️", Industrial: "🏭", Pasture: "🐄",
  PermanentCrop: "🍇", Residential: "🏘️", River: "🌊", SeaLake: "🌊",
};

export default function App() {
  const [file, setFile]           = useState(null);
  const [preview, setPreview]     = useState(null);
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [dragging, setDragging]   = useState(false);
  const inputRef                  = useRef(null);

  // ---- File handling ----
  const handleFile = (f) => {
    if (!f) return;
    if (!["image/jpeg", "image/png", "image/jpg"].includes(f.type)) {
      setError("Please upload a JPG or PNG image.");
      return;
    }
    setFile(f);
    setError(null);
    setResult(null);
    setPreview(URL.createObjectURL(f));
  };

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, []);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);

  // ---- Predict ----
  const predict = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/predict`, { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Server error");
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message || "Failed to reach the API. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null); setPreview(null);
    setResult(null); setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const risk = result ? RISK_COLORS[result.deforestation_risk] ?? RISK_COLORS.low_risk : null;

  return (
    <div style={styles.root}>
      {/* ---- Header ---- */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <span style={styles.logo}>🛰️</span>
          <div>
            <h1 style={styles.title}>SatelliteAI</h1>
            <p style={styles.subtitle}>Land Cover Classification · Deforestation Detection</p>
          </div>
        </div>
      </header>

      <main style={styles.main}>
        {/* ---- Upload Card ---- */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>Upload Satellite Image</h2>
          <p style={styles.cardDesc}>
            Drop a 64×64 to 512×512 satellite image (JPG/PNG). The model detects land cover
            type and flags potential deforestation.
          </p>

          {/* Drop zone */}
          <div
            style={{
              ...styles.dropZone,
              ...(dragging ? styles.dropZoneActive : {}),
              ...(preview  ? styles.dropZoneHasImage : {}),
            }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !preview && inputRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="Preview" style={styles.previewImg} />
            ) : (
              <div style={styles.dropContent}>
                <span style={styles.dropIcon}>📡</span>
                <p style={styles.dropText}>Drag & drop or <span style={styles.link}>browse</span></p>
                <p style={styles.dropHint}>JPG · PNG · up to 10 MB</p>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
          </div>

          {file && (
            <p style={styles.fileName}>📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
          )}

          {/* Buttons */}
          <div style={styles.btnRow}>
            <button
              style={{ ...styles.btn, ...styles.btnPrimary, opacity: (!file || loading) ? 0.5 : 1 }}
              onClick={predict}
              disabled={!file || loading}
            >
              {loading ? "Classifying…" : "🔍 Classify Image"}
            </button>
            {(file || result) && (
              <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={reset}>
                ✕ Reset
              </button>
            )}
          </div>

          {error && <div style={styles.errorBox}>⚠️ {error}</div>}
        </div>

        {/* ---- Loading ---- */}
        {loading && (
          <div style={styles.card}>
            <div style={styles.spinnerWrap}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Running inference on ResNet50…</p>
            </div>
          </div>
        )}

        {/* ---- Results ---- */}
        {result && !loading && (
          <>
            {/* Top prediction */}
            <div style={{ ...styles.card, borderColor: risk.border, background: `${risk.bg}22` }}>
              <div style={styles.resultHeader}>
                <span style={styles.resultIcon}>
                  {CLASS_ICONS[result.prediction] || "🌍"}
                </span>
                <div>
                  <p style={styles.resultLabel}>Predicted Land Type</p>
                  <h2 style={styles.resultClass}>{result.prediction}</h2>
                  <p style={styles.resultDesc}>{result.description}</p>
                </div>
              </div>

              <div style={styles.metaRow}>
                <MetaPill label="Confidence" value={`${(result.confidence * 100).toFixed(1)}%`} />
                <RiskBadge risk={result.deforestation_risk} label={result.deforestation_label} />
              </div>

              {/* Confidence bar */}
              <div style={styles.barBg}>
                <div
                  style={{
                    ...styles.barFill,
                    width: `${result.confidence * 100}%`,
                    background: result.confidence > 0.8
                      ? "#22c55e" : result.confidence > 0.5 ? "#f59e0b" : "#ef4444"
                  }}
                />
              </div>
            </div>

            {/* All class probabilities */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>All Class Probabilities</h3>
              <div style={styles.probGrid}>
                {Object.entries(result.all_probabilities).map(([cls, prob]) => (
                  <ProbRow
                    key={cls}
                    cls={cls}
                    prob={prob}
                    isTop={cls === result.prediction}
                  />
                ))}
              </div>
            </div>

            {/* Deforestation context */}
            <div style={{ ...styles.card, borderColor: risk.border }}>
              <h3 style={styles.cardTitle}>🌳 Deforestation Context</h3>
              <DeforestationNote risk={result.deforestation_risk} cls={result.prediction} />
            </div>
          </>
        )}
      </main>

      <footer style={styles.footer}>
        Powered by ResNet50 trained on EuroSAT · 10 land cover classes · 95%+ accuracy
      </footer>
    </div>
  );
}

// ---- Sub-components ----

function MetaPill({ label, value }) {
  return (
    <div style={styles.metaPill}>
      <span style={styles.metaLabel}>{label}</span>
      <span style={styles.metaValue}>{value}</span>
    </div>

    
  );
}


{/* Replace your existing metaRow + barBg block with this */}



function RiskBadge({ risk, label }) {
  const c = RISK_COLORS[risk] ?? RISK_COLORS.low_risk;
  return (
    <div style={{ ...styles.riskBadge, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>
      {label}
    </div>
  );
}

function ProbRow({ cls, prob, isTop }) {
  return (
    <div style={{ ...styles.probRow, background: isTop ? "#1e3a1e" : "transparent" }}>
      <span style={styles.probIcon}>{CLASS_ICONS[cls] || "🌍"}</span>
      <span style={{ ...styles.probCls, color: isTop ? "#86efac" : "#d1fae5" }}>{cls}</span>
      <div style={styles.probBarBg}>
        <div
          style={{
            ...styles.probBarFill,
            width: `${prob * 100}%`,
            background: isTop ? "#22c55e" : "#374151"
          }}
        />
      </div>
      <span style={styles.probPct}>{(prob * 100).toFixed(1)}%</span>
    </div>
  );
}

function DeforestationNote({ risk, cls }) {
  const notes = {
    baseline:    `This area is currently classified as Forest — it's a baseline reference. Compare with future images to detect change.`,
    high_risk:   `${cls} land is a strong indicator of former forest conversion. If this region previously showed Forest, deforestation may have occurred.`,
    medium_risk: `${cls} land carries moderate conversion risk. Seasonal imaging recommended to track change over time.`,
    low_risk:    `${cls} classification carries low deforestation correlation. No immediate concern flagged.`,
  };
  return (
    <div style={styles.noteBox}>
      <p style={styles.noteText}>{notes[risk]}</p>
      <p style={styles.noteSub}>
        💡 For deforestation detection: classify the same patch from two time periods
        (e.g. 2018 vs 2024). A Forest→{"{AnnualCrop/Pasture/Industrial}"} transition = detected deforestation.
      </p>
    </div>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = {
  root: {
    minHeight: "100vh",
    background: "#030712",
    color: "#f0fdf4",
    fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "#0a1628",
    borderBottom: "1px solid #1a3a2a",
    padding: "16px 24px",
  },
  headerInner: {
    maxWidth: 720,
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    gap: 14,
  },
  logo: { fontSize: 36 },
  title: { margin: 0, fontSize: 22, fontWeight: 700, color: "#86efac", letterSpacing: "-0.5px" },
  subtitle: { margin: 0, fontSize: 13, color: "#6b7280", marginTop: 2 },

  main: {
    flex: 1,
    maxWidth: 720,
    width: "100%",
    margin: "32px auto",
    padding: "0 16px",
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },

  card: {
    background: "#0d1117",
    border: "1px solid #1f2937",
    borderRadius: 14,
    padding: "24px",
    transition: "border-color 0.3s",
  },
  cardTitle: { margin: "0 0 8px", fontSize: 17, fontWeight: 600, color: "#d1fae5" },
  cardDesc:  { margin: "0 0 20px", fontSize: 14, color: "#6b7280", lineHeight: 1.6 },

  dropZone: {
    border: "2px dashed #1f2937",
    borderRadius: 12,
    padding: "40px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.2s",
    marginBottom: 16,
    minHeight: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dropZoneActive:   { borderColor: "#22c55e", background: "#0a1f0a" },
  dropZoneHasImage: { padding: 8, cursor: "default", background: "#0a0f0a" },
  dropContent: { display: "flex", flexDirection: "column", alignItems: "center", gap: 8 },
  dropIcon:  { fontSize: 40 },
  dropText:  { margin: 0, fontSize: 15, color: "#9ca3af" },
  dropHint:  { margin: 0, fontSize: 12, color: "#374151" },
  link:      { color: "#22c55e", cursor: "pointer" },
  previewImg: {
    maxWidth: "100%",
    maxHeight: 280,
    borderRadius: 8,
    objectFit: "contain",
    imageRendering: "pixelated",
  },
  fileName: { fontSize: 13, color: "#6b7280", margin: "0 0 16px" },

  btnRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  btn: {
    padding: "10px 22px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    transition: "all 0.2s",
  },
  btnPrimary: { background: "#16a34a", color: "#fff" },
  btnGhost:   { background: "transparent", color: "#6b7280", border: "1px solid #1f2937" },

  errorBox: {
    marginTop: 14,
    padding: "12px 16px",
    background: "#450a0a",
    border: "1px solid #7f1d1d",
    borderRadius: 8,
    color: "#fca5a5",
    fontSize: 14,
  },

  spinnerWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "20px 0" },
  spinner: {
    width: 40, height: 40,
    border: "3px solid #1f2937",
    borderTop: "3px solid #22c55e",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: { color: "#6b7280", fontSize: 14, margin: 0 },

  resultHeader: { display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 16 },
  resultIcon:   { fontSize: 42, lineHeight: 1 },
  resultLabel:  { margin: "0 0 2px", fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  resultClass:  { margin: "0 0 4px", fontSize: 24, fontWeight: 700, color: "#86efac" },
  resultDesc:   { margin: 0, fontSize: 13, color: "#9ca3af", lineHeight: 1.5 },

  metaRow:  { display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  metaPill: {
    display: "flex", flexDirection: "column",
    background: "#111827", borderRadius: 8,
    padding: "8px 14px", border: "1px solid #1f2937",
  },
  metaLabel: { fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8 },
  metaValue: { fontSize: 18, fontWeight: 700, color: "#d1fae5" },
  riskBadge: { padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center" },

  barBg:   { height: 6, background: "#1f2937", borderRadius: 99, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 99, transition: "width 1s ease" },

  probGrid: { display: "flex", flexDirection: "column", gap: 6 },
  probRow:  {
    display: "flex", alignItems: "center", gap: 8,
    padding: "6px 10px", borderRadius: 7,
  },
  probIcon: { fontSize: 16, width: 22, textAlign: "center" },
  probCls:  { width: 170, fontSize: 13, fontWeight: 500, flexShrink: 0 },
  probBarBg:  { flex: 1, height: 6, background: "#1f2937", borderRadius: 99, overflow: "hidden" },
  probBarFill:{ height: "100%", borderRadius: 99, transition: "width 0.8s ease" },
  probPct:  { width: 44, fontSize: 12, color: "#6b7280", textAlign: "right" },

  noteBox: {
    background: "#0a1628",
    border: "1px solid #1e3a5f",
    borderRadius: 8,
    padding: "14px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  noteText: { margin: 0, fontSize: 14, color: "#bfdbfe", lineHeight: 1.6 },
  noteSub:  { margin: 0, fontSize: 12, color: "#6b7280", lineHeight: 1.6 },

  footer: {
    textAlign: "center",
    padding: "24px",
    color: "#374151",
    fontSize: 12,
    borderTop: "1px solid #111827",
  },
};

// Inject spinner keyframe
const style = document.createElement("style");
style.textContent = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(style);