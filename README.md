# MMFetUS — web demo

A fully client-side web app for a **usability study** of a fetal-ultrasound
classifier. The user picks a bundled example **or loads a real ultrasound
image**, a CNN runs **in the browser** (ONNX Runtime Web — no upload, no server),
the result is shown, and a short questionnaire is saved to a Google Sheet.

> ⚠️ Research prototype (UFSC), **not a medical device**. Do not use for clinical
> decisions. All inference runs locally in the browser; images are never sent
> anywhere.

Runs on any modern browser, **including iPhone Safari** — just open the URL.

## Contents

```
index.html          UI (Avaliar + Referências tabs)
app.js              model load, in-browser inference, survey
styles.css          styling
config.js           Apps Script URL for survey logging (optional)
model.onnx          int8 2-head ResNet18 (~11 MB), opset 12 QDQ
model_meta.json     input size, mean/std, output order, thresholds
examples/           6 de-identified full ultrasound frames + manifest.json
apps_script/        Google Sheet survey collector (Code.gs + SETUP.md)
```

## The model

Image-only, two-head CNN (ResNet18), trained on full PHI-cropped ultrasound
frames so both examples and uploads are in-domain. Demo-grade (not the full
multimodal result):

- **LGA** (fetal overgrowth) — primary. Test AUROC ≈ 0.83.
- **C-peptide > p75** — secondary/experimental (val AUROC ≈ chance; caveated).

Decision thresholds are prevalence-matched. int8-quantized for fast web load.

## Survey logging

See `apps_script/SETUP.md`: create a Google Sheet, deploy the Apps Script web
app, and paste its `/exec` URL into `config.js` (`appsScriptUrl`). The browser
POSTs each submission (no-cors) and it is appended as a row. Leave empty to
disable logging.

## Run locally

```bash
python -m http.server 8000      # then open http://localhost:8000
```

## Publish (GitHub Pages)

Enable Pages for this repo (Settings → Pages → Deploy from branch → `main` /
root). Public repos: free. Private repos: needs GitHub Pro/Team or Education.

## Rebuild the model

The training/export pipeline lives in the parent project
(`mmfetus_app/train_export/`): `render_full_frames.py` → `train_image_cnn.py` →
`quantize_for_web.py`.
