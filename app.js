/* MMFetUS web demo — in-browser ONNX inference + usability survey. */
"use strict";

const CFG = window.MMFETUS_CONFIG || { appsScriptUrl: "", appVersion: "web" };
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let META = null;        // model_meta.json
let SESSION = null;     // ort.InferenceSession
let lastPred = null;    // {lga, pept}
let lastCase = null;    // string id
const likert = {};      // q index -> 1..5

const $ = (id) => document.getElementById(id);

// Use the CDN dist for the wasm binaries too.
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";

// ---------------------------------------------------------------- tabs
document.querySelectorAll(".tab").forEach((t) => {
  t.onclick = () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    document.querySelectorAll(".page").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    $(t.dataset.tab).classList.add("active");
  };
});

// ---------------------------------------------------------------- init
async function init() {
  $("app-version").textContent = CFG.appVersion;
  try {
    META = await (await fetch("model_meta.json")).json();
    SESSION = await ort.InferenceSession.create("model.onnx", {
      executionProviders: ["wasm"],
    });
    $("model-status").classList.add("hidden");
  } catch (e) {
    $("model-status").textContent = "Falha ao carregar o modelo: " + e;
    return;
  }
  await loadExamples();
  buildLikert();
  wireSurvey();
}

async function loadExamples() {
  const man = await (await fetch("examples/manifest.json")).json();
  const grid = $("examples");
  grid.innerHTML = "";
  man.examples.forEach((ex) => {
    const div = document.createElement("div");
    div.className = "ex";
    div.innerHTML = `<img src="examples/${ex.file}" alt="${ex.id}" /><span>${ex.id}</span>`;
    div.onclick = () => evaluate("examples/" + ex.file, ex.id);
    grid.appendChild(div);
  });
}

$("file-input").onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  evaluate(URL.createObjectURL(f), f.name);
};

$("result-back").onclick = showPicker;

// ---------------------------------------------------------------- inference
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

function preprocess(img) {
  const c = document.createElement("canvas");
  c.width = META.input_size;
  c.height = META.input_size;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const n = c.width * c.height;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    for (let ch = 0; ch < 3; ch++) {
      const v = d[i * 4 + ch] / 255.0;
      out[ch * n + i] = (v - MEAN[ch]) / STD[ch];
    }
  }
  return out;
}

async function evaluate(src, caseId) {
  lastCase = caseId;
  showResult();
  $("result-img").src = src;
  $("result-loading").classList.remove("hidden");
  $("result-body").classList.add("hidden");
  try {
    const img = await loadImage(src);
    const data = preprocess(img);
    const t = new ort.Tensor("float32", data, [1, 3, META.input_size, META.input_size]);
    const r = await SESSION.run({ input: t });
    const probs = r.probs.data; // Float32Array [lga, pept]
    lastPred = { lga: probs[0], pept: probs[1] };
    renderResult();
  } catch (e) {
    $("result-loading").textContent = "Erro ao avaliar: " + e;
  }
}

function card(out, prob) {
  const high = prob >= out.threshold;
  const cls = high ? "elev" : "baixo";
  const pct = (prob * 100).toFixed(1);
  const caveat = out.name === "pept_c_p75"
    ? `<div class="note muted">Alvo experimental: baixa aprendibilidade nesta coorte. Interprete com cautela.</div>`
    : "";
  return `
    <div class="title">${out.label}</div>
    <div>
      <span class="pct ${cls}">${pct}%</span>
      <span class="chip bg-${cls} ${cls}">${high ? "Risco elevado" : "Risco baixo"}</span>
    </div>
    <div class="bar-track"><div class="bar-fill bg-${cls}" style="width:${Math.min(100, prob*100)}%;background:${high ? "var(--red)" : "var(--green)"}"></div></div>
    <div class="note muted">Limiar de decisão: ${(out.threshold*100).toFixed(0)}%</div>
    ${caveat}`;
}

function renderResult() {
  $("result-loading").classList.add("hidden");
  $("result-body").classList.remove("hidden");
  $("m-lga").innerHTML = card(META.outputs[0], lastPred.lga);
  $("m-pept").innerHTML = card(META.outputs[1], lastPred.pept);
}

function showPicker() {
  $("result").classList.add("hidden");
  $("survey").classList.add("hidden");
  document.querySelector(".picker").classList.remove("hidden");
}
function showResult() {
  document.querySelector(".picker").classList.add("hidden");
  $("survey").classList.add("hidden");
  $("result").classList.remove("hidden");
}

// ---------------------------------------------------------------- survey
const QUESTIONS = [
  "A tela inicial foi fácil de entender.",
  "Escolher/enviar um exame foi simples.",
  "O resultado foi apresentado de forma clara.",
  "Eu confiaria neste app como apoio (não como diagnóstico).",
  "Eu usaria este app novamente.",
];

function buildLikert() {
  const box = $("likert");
  QUESTIONS.forEach((q, i) => {
    const item = document.createElement("div");
    item.className = "likert-item";
    item.innerHTML = `<p>${q}</p><div class="likert-opts">` +
      [1,2,3,4,5].map((n) => `<button data-q="${i}" data-n="${n}">${n}</button>`).join("") +
      `</div>`;
    box.appendChild(item);
  });
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const qi = b.dataset.q;
      box.querySelectorAll(`button[data-q="${qi}"]`).forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      likert[qi] = parseInt(b.dataset.n, 10);
      checkComplete();
    };
  });
}

function checkComplete() {
  const done = Object.keys(likert).length === QUESTIONS.length && $("role").value;
  $("submit-survey").disabled = !done;
}

function wireSurvey() {
  $("go-survey").onclick = () => {
    $("result").classList.add("hidden");
    $("survey").classList.remove("hidden");
  };
  $("role").onchange = checkComplete;
  $("submit-survey").onclick = submitSurvey;
}

async function submitSurvey() {
  const btn = $("submit-survey");
  btn.disabled = true;
  const payload = {
    timestamp: new Date().toISOString(),
    app_version: CFG.appVersion,
    case_id: lastCase,
    lga_prob: lastPred ? lastPred.lga : null,
    pept_c_p75_prob: lastPred ? lastPred.pept : null,
    role: $("role").value,
    comments: $("comments").value.trim(),
  };
  QUESTIONS.forEach((_, i) => (payload["q" + (i + 1)] = likert[i] ?? null));

  const msg = $("survey-msg");
  if (!CFG.appsScriptUrl) {
    msg.textContent = "Envio remoto não configurado — respostas não foram salvas.";
    return;
  }
  try {
    // no-cors + text/plain avoids a CORS preflight; Apps Script reads the body.
    await fetch(CFG.appsScriptUrl, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    msg.textContent = "Obrigado! Respostas enviadas.";
    setTimeout(showPicker, 1200);
  } catch (e) {
    msg.textContent = "Não foi possível enviar agora. Tente novamente.";
    btn.disabled = false;
  }
}

init();
