/* MMFetUS web demo — in-browser ONNX inference + usability survey. */
"use strict";

const CFG = window.MMFETUS_CONFIG || { appsScriptUrl: "", appVersion: "web" };
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let META = null;        // model_meta.json
let SESSION = null;     // ort.InferenceSession
let lastPred = null;    // {lga, pept}
let lastCase = null;    // string id
let consentTs = null;   // ISO timestamp when the participant agreed

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
  buildMatchMed();
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
  $("consent").classList.add("hidden");
  $("survey").classList.add("hidden");
  document.querySelector(".picker").classList.remove("hidden");
}
function showResult() {
  document.querySelector(".picker").classList.add("hidden");
  $("consent").classList.add("hidden");
  $("survey").classList.add("hidden");
  $("result").classList.remove("hidden");
}

// ---------------------------------------------------------------- survey
// MATCH-MED v2.1 — usability heuristics + checklist for mHealth apps
// (Gresse von Wangenheim, von Wangenheim et al., INCoD/GQS.10.2017.P, UFSC).
const MM_SCALE = ["Sim", "Parcialmente", "Não atende", "Não se aplica"];
const MATCHMED = [
  { h: "Visibilidade do estado do aplicativo", items: [
    { n: 1, t: "O usuário é informado sobre o que está acontecendo no aplicativo por meio de feedback e exibição das informações de forma clara, concisa e apropriada.", ex: "Ex.: após enviar uma mensagem, o app exibe “Mensagem enviada”." },
    { n: 2, t: "Componentes selecionados são destacados, enquanto componentes desabilitados são “acinzentados” ou omitidos." },
    { n: 3, t: "Informação crítica e contextual (status da bateria, data/hora, conexão com a internet, etc.) é priorizada e visível.", ex: "Ex.: em exames, a data de realização é sempre visível." },
  ]},
  { h: "Correspondência entre o aplicativo e o mundo real", items: [
    { n: 4, t: "Os rótulos dos controles são consistentes com as suas ações.", ex: "Ex.: o rótulo “Pacientes” leva para a tela de pacientes." },
    { n: 5, t: "A informação aparece em uma ordem lógica e natural.", ex: "Ex.: as listas de opção são ordenadas alfabeticamente." },
    { n: 6, t: "As opções e rótulos de menu podem ser compreendidos rapidamente." },
    { n: 7, t: "Ícones, imagens e outros componentes de interface são concretos e familiares." },
    { n: 8, t: "As cores usadas correspondem às expectativas comuns sobre o código de cores.", ex: "Ex.: vermelho alerta sobre problemas, não confirma ações." },
    { n: 9, t: "A linguagem usada é sempre de forma a ser entendida pelos usuários.", ex: "Ex.: vocabulário padronizado para médicos como UMLS ou SNOMED." },
  ]},
  { h: "Controle e liberdade do usuário", items: [
    { n: 10, t: "Os usuários podem avançar e retroceder na navegação do aplicativo." },
    { n: 11, t: "Os usuários podem salvar tarefas no meio da execução para continuar futuramente.", ex: "Ex.: salvar um formulário parcialmente preenchido." },
  ]},
  { h: "Consistência e padrões", items: [
    { n: 12, t: "Os elementos da interface seguem uma terminologia padrão.", ex: "Ex.: usar sempre “Enviar”, não “Submeter” e “Enviar”." },
    { n: 13, t: "A navegação do aplicativo e o layout das telas são consistentes." },
    { n: 14, t: "O estilo da interface é consistente nas telas do aplicativo." },
    { n: 15, t: "O aplicativo segue as convenções da plataforma.", ex: "Ex.: em iOS, o botão de voltar aparece no topo esquerdo." },
  ]},
  { h: "Prevenção de erros", items: [
    { n: 16, t: "A variação válida dos parâmetros (limites mínimo e máximo) é indicada.", ex: "Ex.: ao inserir a dosagem de um medicamento." },
    { n: 17, t: "As opções do menu são lógicas, diferentes e mutuamente exclusivas." },
    { n: 18, t: "O aplicativo requer procedimentos para confirmar ações de risco que podem causar erros acidentais." },
  ]},
  { h: "Reconhecimento em vez de lembrança", items: [
    { n: 19, t: "Todas as informações necessárias para o usuário realizar as tarefas são visíveis e/ou fáceis de encontrar." },
    { n: 20, t: "Um código de cor único é usado para rápida identificação e lembrança.", ex: "Ex.: exame sem laudo com ícone vermelho; com laudo, verde." },
    { n: 21, t: "O aplicativo fornece todas as informações necessárias." },
    { n: 22, t: "Os menus são balanceados, nem muito profundos nem largos demais." },
  ]},
  { h: "Eficiência e flexibilidade", items: [
    { n: 23, t: "As principais funcionalidades do aplicativo são fáceis de acessar." },
    { n: 24, t: "Funcionalidades relacionadas estão próximas umas das outras." },
    { n: 25, t: "O tempo necessário para completar a tarefa é adequado." },
    { n: 26, t: "A entrada de dados e a navegação são mínimas." },
    { n: 27, t: "A necessidade de usar o scroll é evitada." },
  ]},
  { h: "Estética e design minimalista", items: [
    { n: 28, t: "O design visual é atraente." },
    { n: 29, t: "As telas têm um design “clean”, apresentando somente informações e componentes importantes." },
    { n: 30, t: "O conteúdo da tela é sempre visível completamente e não coberto por outros componentes de interface." },
    { n: 31, t: "O uso do espaço disponível da tela é maximizado." },
  ]},
  { h: "Interação física e ergonomia", items: [
    { n: 32, t: "Os componentes de ação “touch” têm tamanho adequado para que os usuários possam tocá-los facilmente com os dedos." },
    { n: 33, t: "Os botões têm uma distância adequada entre si para evitar que o usuário pressione o botão errado." },
  ]},
  { h: "Leiturabilidade e visualização rápida", items: [
    { n: 34, t: "É possível visualizar as informações rapidamente." },
    { n: 35, t: "Informações importantes são destacadas.", ex: "Ex.: destacadas com fonte em negrito." },
    { n: 36, t: "Há um bom contraste de cor e brilho entre imagens, textos, ícones e plano de fundo." },
    { n: 37, t: "Dicas visuais são usadas para separar conteúdo não relacionado.", ex: "Ex.: espaço em branco." },
    { n: 38, t: "O conteúdo é fácil de ler." },
    { n: 39, t: "Textos são apresentados de forma organizada." },
    { n: 40, t: "Ícones e imagens têm tamanho e resolução apropriados." },
    { n: 41, t: "Os campos de texto cabem na tela." },
  ]},
  { h: "Fluxo de trabalho", items: [
    { n: 42, t: "Está claro onde iniciar as atividades." },
    { n: 43, t: "O fluxo das telas corresponde ao fluxo das atividades do usuário." },
  ]},
];
const MM_TOTAL = MATCHMED.reduce((a, g) => a + g.items.length, 0);
const mm = {}; // item n -> scale value

function buildMatchMed() {
  const box = $("matchmed");
  box.innerHTML = "";
  MATCHMED.forEach((group) => {
    const g = document.createElement("div");
    g.className = "mm-group";
    g.innerHTML = `<h3>${group.h}</h3>`;
    group.items.forEach((it) => {
      const item = document.createElement("div");
      item.className = "mm-item";
      item.innerHTML =
        `<p><b>${it.n}.</b> ${it.t}</p>` +
        (it.ex ? `<p class="muted mm-ex">${it.ex}</p>` : "") +
        `<div class="mm-opts">` +
        MM_SCALE.map((s) => `<button data-n="${it.n}" data-v="${s}">${s}</button>`).join("") +
        `</div>`;
      g.appendChild(item);
    });
    box.appendChild(g);
  });
  box.querySelectorAll("button").forEach((b) => {
    b.onclick = () => {
      const n = b.dataset.n;
      box.querySelectorAll(`button[data-n="${n}"]`).forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      mm[n] = b.dataset.v;
      updateProgress();
    };
  });
  updateProgress();
}

function updateProgress() {
  const done = Object.keys(mm).length;
  $("mm-progress").textContent = `${done}/${MM_TOTAL} itens respondidos`;
  $("submit-survey").disabled = !(done === MM_TOTAL && $("role").value);
}

function wireSurvey() {
  // Result → consent gate (must agree before seeing the survey).
  $("go-survey").onclick = () => {
    $("result").classList.add("hidden");
    $("consent").classList.remove("hidden");
    window.scrollTo(0, 0);
  };
  $("consent-check").onchange = (e) => {
    $("consent-continue").disabled = !e.target.checked;
  };
  $("consent-continue").onclick = () => {
    consentTs = new Date().toISOString();
    $("consent").classList.add("hidden");
    $("survey").classList.remove("hidden");
    window.scrollTo(0, 0);
  };
  $("consent-decline").onclick = showPicker;
  $("role").onchange = updateProgress;
  $("submit-survey").onclick = submitSurvey;
}

async function submitSurvey() {
  const btn = $("submit-survey");
  btn.disabled = true;
  const payload = {
    timestamp: new Date().toISOString(),
    app_version: CFG.appVersion,
    instrument: "MATCH-MED v2.1",
    consent_agreed: true,
    consent_timestamp: consentTs,
    case_id: lastCase,
    lga_prob: lastPred ? lastPred.lga : null,
    pept_c_p75_prob: lastPred ? lastPred.pept : null,
    role: $("role").value,
    comments: $("comments").value.trim(),
  };
  MATCHMED.forEach((g) => g.items.forEach((it) => (payload["mm_" + it.n] = mm[it.n] ?? null)));

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
