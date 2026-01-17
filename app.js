/* Vocab SRS — single-file app.js
   - Teacher: add/edit/remove terms, import/export JSON/CSV
   - Student: spaced repetition (SM-2 style) with MC + typing + audio spelling
   - Storage: localStorage (offline)
*/

const STORE_KEY = "vocab_srs_v1";
const DAY = 24 * 60 * 60 * 1000;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function now() { return Date.now(); }

function norm(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function fmtDue(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

function download(filename, text) {
  const blob = new Blob([text], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** ============ Data model ============
state = {
  activeDeckId,
  decks: {
    [id]: {
      id, title, createdAt,
      items: [{
        id, term, definition, example,
        createdAt,
        srs: { ef, reps, intervalDays, due, lapses, lastReviewed }
      }]
    }
  }
}
*/

function defaultSRS() {
  return { ef: 2.5, reps: 0, intervalDays: 0, due: now(), lapses: 0, lastReviewed: 0 };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);

    // basic migration/validation
    if (!parsed.decks || !parsed.activeDeckId) return seedState();
    return parsed;
  } catch {
    return seedState();
  }
}

function saveState() {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function seedState() {
  const id = uid();
  const st = {
    activeDeckId: id,
    decks: {
      [id]: {
        id,
        title: "My Vocabulary Deck",
        createdAt: now(),
        items: []
      }
    }
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(st));
  return st;
}

let state = loadState();

function activeDeck() {
  return state.decks[state.activeDeckId];
}

/** ============ Tabs ============
*/
function setTab(name) {
  $$(".tab").forEach(btn => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  $$(".panel").forEach(p => p.classList.remove("active"));
  $(`#tab-${name}`).classList.add("active");
}

/** ============ Teacher UI ============
*/
function renderTeacher() {
  const deck = activeDeck();
  $("#deckTitle").value = deck.title;
  $("#studyDeckTitle").value = deck.title;

  const q = norm($("#searchItems").value);
  const items = deck.items
    .filter(it => !q || norm(it.term).includes(q) || norm(it.definition).includes(q))
    .sort((a, b) => (a.term || "").localeCompare(b.term || ""));

  const tbody = $("#itemsTbody");
  tbody.innerHTML = "";

  for (const it of items) {
    const tr = document.createElement("tr");

    const tdTerm = document.createElement("td");
    tdTerm.textContent = it.term;

    const tdDef = document.createElement("td");
    tdDef.textContent = it.definition;

    const tdDue = document.createElement("td");
    const due = it.srs?.due ?? 0;
    tdDue.textContent = due ? fmtDue(due) : "—";

    const tdActions = document.createElement("td");
    const del = document.createElement("button");
    del.className = "btn btn-ghost";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      if (!confirm(`Delete "${it.term}"?`)) return;
      deck.items = deck.items.filter(x => x.id !== it.id);
      saveState();
      renderAll();
    });
    tdActions.appendChild(del);

    tr.appendChild(tdTerm);
    tr.appendChild(tdDef);
    tr.appendChild(tdDue);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  }

  renderStats();
}

function addItemFromForm() {
  const term = $("#termInput").value.trim();
  const definition = $("#defInput").value.trim();
  const example = $("#exInput").value.trim();

  if (!term || !definition) {
    alert("Please add both a term and a definition.");
    return;
  }

  const deck = activeDeck();
  const dupe = deck.items.some(it => norm(it.term) === norm(term));
  if (dupe && !confirm("A term with the same spelling already exists. Add anyway?")) return;

  deck.items.push({
    id: uid(),
    term,
    definition,
    example,
    createdAt: now(),
    srs: defaultSRS()
  });

  $("#termInput").value = "";
  $("#defInput").value = "";
  $("#exInput").value = "";

  saveState();
  renderAll();
  $("#termInput").focus();
}

function resetProgress() {
  const deck = activeDeck();
  if (!confirm("Reset scheduling/progress for ALL items in this deck? (Terms stay.)")) return;
  deck.items = deck.items.map(it => ({ ...it, srs: defaultSRS() }));
  saveState();
  renderAll();
}

function exportDeckJSON() {
  const deck = activeDeck();
  const out = {
    type: "vocab_srs_deck",
    version: 1,
    exportedAt: now(),
    deck: {
      id: deck.id,
      title: deck.title,
      createdAt: deck.createdAt,
      items: deck.items
    }
  };
  const safeName = deck.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "deck";
  download(`${safeName}.json`, JSON.stringify(out, null, 2));
}

function exportDeckCSV() {
  const deck = activeDeck();
  const lines = [];
  lines.push(`term,definition,example`);
  for (const it of deck.items) {
    const row = [it.term, it.definition, it.example || ""]
      .map(v => `"${String(v ?? "").replaceAll(`"`, `""`)}"`)
      .join(",");
    lines.push(row);
  }
  const safeName = deck.title.replace(/[^\w\-]+/g, "_").slice(0, 40) || "deck";
  download(`${safeName}.csv`, lines.join("\n"));
}

async function importDeckFile(file) {
  const text = await file.text();
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const deck = parsed.deck && Array.isArray(parsed.deck.items) ? parsed.deck : parsed;

    // Accept either wrapped export or raw deck object
    const incoming = {
      id: deck.id || uid(),
      title: deck.title || "Imported Deck",
      createdAt: deck.createdAt || now(),
      items: (deck.items || []).map(it => ({
        id: it.id || uid(),
        term: it.term || "",
        definition: it.definition || "",
        example: it.example || "",
        createdAt: it.createdAt || now(),
        srs: it.srs ? {
          ef: Number(it.srs.ef ?? 2.5),
          reps: Number(it.srs.reps ?? 0),
          intervalDays: Number(it.srs.intervalDays ?? 0),
          due: Number(it.srs.due ?? now()),
          lapses: Number(it.srs.lapses ?? 0),
          lastReviewed: Number(it.srs.lastReviewed ?? 0),
        } : defaultSRS()
      })).filter(it => it.term && it.definition)
    };

    // add as new deck and activate
    state.decks[incoming.id] = incoming;
    state.activeDeckId = incoming.id;
    saveState();
    renderAll();
    alert(`Imported deck: ${incoming.title} (${incoming.items.length} items)`);
    return;
  }

  // CSV import: term,definition,example
  if (lower.endsWith(".csv") || file.type.includes("csv") || text.includes(",")) {
    const rows = parseCSV(text);
    const items = [];
    for (const r of rows) {
      const term = (r.term ?? r.Term ?? r[0] ?? "").toString().trim();
      const definition = (r.definition ?? r.Definition ?? r[1] ?? "").toString().trim();
      const example = (r.example ?? r.Example ?? r[2] ?? "").toString().trim();
      if (!term || !definition) continue;
      items.push({ id: uid(), term, definition, example, createdAt: now(), srs: defaultSRS() });
    }

    const id = uid();
    const deck = { id, title: file.name.replace(/\.[^.]+$/, ""), createdAt: now(), items };
    state.decks[id] = deck;
    state.activeDeckId = id;
    saveState();
    renderAll();
    alert(`Imported CSV deck: ${deck.title} (${deck.items.length} items)`);
    return;
  }

  alert("Unsupported file type. Use .json or .csv");
}

function parseCSV(text) {
  // Small, forgiving CSV parser (handles quoted commas and headers).
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim().length);
  if (!lines.length) return [];
  const raw = lines.map(parseCSVLine);

  const header = raw[0].map(h => norm(h));
  const hasHeader = header.includes("term") && header.includes("definition");

  if (!hasHeader) {
    // return arrays
    return raw;
  }

  const idxTerm = header.indexOf("term");
  const idxDef = header.indexOf("definition");
  const idxEx = header.indexOf("example");

  return raw.slice(1).map(cols => ({
    term: cols[idxTerm] ?? "",
    definition: cols[idxDef] ?? "",
    example: idxEx >= 0 ? (cols[idxEx] ?? "") : ""
  }));
}

function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** ============ Student / Study ============
*/
let session = null;

function computeStats(deck) {
  const t = now();
  const total = deck.items.length;
  const due = deck.items.filter(it => (it.srs?.due ?? t) <= t).length;
  const fresh = deck.items.filter(it => (it.srs?.reps ?? 0) === 0).length;
  return { total, due, fresh };
}

function renderStats() {
  const deck = activeDeck();
  const { total, due, fresh } = computeStats(deck);
  $("#statTotal").textContent = String(total);
  $("#statDue").textContent = String(due);
  $("#statNew").textContent = String(fresh);
}

function startStudy({ ahead = false } = {}) {
  const deck = activeDeck();
  const limit = Number($("#dailyLimit").value);
  const mode = $("#modeSelect").value;

  const t = now();
  const dueItems = deck.items.filter(it => (it.srs?.due ?? t) <= t);
  const pool = ahead ? deck.items.slice() : dueItems;

  if (!pool.length) {
    $("#studyEmpty").textContent = ahead
      ? "No cards found in this deck yet. Ask your teacher to add terms."
      : "Nothing is due right now. Try Study ahead, or come back later.";
    $("#studyEmpty").classList.remove("hidden");
    $("#studyUI").classList.add("hidden");
    return;
  }

  // order: due first, then earliest due
  pool.sort((a, b) => (a.srs?.due ?? t) - (b.srs?.due ?? t));

  session = {
    deckId: deck.id,
    mode,
    ahead,
    idx: 0,
    total: Math.min(limit, pool.length),
    queue: pool.slice(0, Math.min(limit, pool.length)).map(it => it.id),
    current: null,
    currentTask: null,
    revealed: false,
    hintUsed: false
  };

  $("#studyEmpty").classList.add("hidden");
  $("#studyUI").classList.remove("hidden");
  $("#pillMode").textContent = `Mode: ${labelMode(mode)}`;

  nextCard();
}

function labelMode(mode) {
  switch (mode) {
    case "mc": return "Multiple choice";
    case "type_def": return "Type from definition";
    case "type_audio": return "Type from audio";
    default: return "Mixed";
  }
}

function getItemById(id) {
  return activeDeck().items.find(it => it.id === id);
}

function pickTaskForItem(item, forcedMode) {
  const deck = activeDeck();
  const count = deck.items.length;

  // if not enough distractors, don't do MC
  const canMC = count >= 4;

  if (forcedMode === "mc") return canMC ? "mc" : "type_def";
  if (forcedMode === "type_def") return "type_def";
  if (forcedMode === "type_audio") return "type_audio";

  // mixed: bias toward spelling sometimes, but keep MC in rotation
  const r = Math.random();
  if (canMC && r < 0.45) return "mc";
  if (r < 0.75) return "type_def";
  return "type_audio";
}

function nextCard() {
  const deck = activeDeck();
  if (!session) return;

  if (session.idx >= session.total) {
    finishSession();
    return;
  }

  const id = session.queue[session.idx];
  const item = getItemById(id);

  session.current = item;
  session.currentTask = pickTaskForItem(item, session.mode);
  session.revealed = false;
  session.hintUsed = false;

  $("#pillProgress").textContent = `${session.idx + 1} / ${session.total}`;
  $("#pillDue").textContent = (item.srs?.due ?? now()) <= now() ? "Due" : "Ahead";

  // reset UI
  $("#feedback").innerHTML = "";
  $("#gradeRow").classList.add("hidden");
  $("#btnNext").classList.add("hidden");

  $$(".choice").forEach(btn => btn.classList.remove("correct", "wrong"));
  $("#mcBox").innerHTML = "";

  $("#typingInput").value = "";
  $("#typingInput").disabled = false;

  $("#mcBox").classList.add("hidden");
  $("#typingBox").classList.add("hidden");
  $("#audioRow").classList.add("hidden");

  // render based on task
  const task = session.currentTask;

  if (task === "mc") {
    renderMC(item);
  } else if (task === "type_def") {
    renderTypeFromDef(item);
  } else {
    renderTypeFromAudio(item);
  }
}

function finishSession() {
  $("#prompt").innerHTML = `<div class="big">Done!</div><div class="sub">Nice work. Come back later for the next due set.</div>`;
  $("#mcBox").classList.add("hidden");
  $("#typingBox").classList.add("hidden");
  $("#audioRow").classList.add("hidden");
  $("#gradeRow").classList.add("hidden");
  $("#btnNext").classList.add("hidden");
  $("#feedback").textContent = "";
  session = null;
  renderStats();
  saveState();
}

function showGradeButtons() {
  $("#gradeRow").classList.remove("hidden");
  $("#btnNext").classList.remove("hidden");
}

function setPrompt(html) {
  $("#prompt").innerHTML = html;
}

/** ============ Tasks ============
Multiple choice: show term, choose definition
Type from def: show definition, type term
Type from audio: speak term, type term
*/

function renderMC(item) {
  $("#mcBox").classList.remove("hidden");

  setPrompt(`
    <div class="big">${escapeHTML(item.term)}</div>
    <div class="sub">Choose the correct definition.</div>
  `);

  const deck = activeDeck();
  const others = deck.items.filter(it => it.id !== item.id);
  shuffleInPlace(others);

  const distractors = others.slice(0, 3).map(it => it.definition);
  const choices = shuffleArray([item.definition, ...distractors]);

  const mcBox = $("#mcBox");
  choices.forEach(def => {
    const btn = document.createElement("button");
    btn.className = "choice";
    btn.type = "button";
    btn.textContent = def;
    btn.addEventListener("click", () => {
      if (session.revealed) return;
      const correct = def === item.definition;
      btn.classList.add(correct ? "correct" : "wrong");

      // also mark correct one
      if (!correct) {
        const all = Array.from(mcBox.querySelectorAll(".choice"));
        all.forEach(b => {
          if (b.textContent === item.definition) b.classList.add("correct");
        });
      }

      session.revealed = true;
      const suggested = correct ? "good" : "again";
      $("#feedback").innerHTML = correct
        ? `<b>Correct.</b> ${item.example ? `<span class="muted">Example: ${escapeHTML(item.example)}</span>` : ""}`
        : `<b>Not quite.</b> Correct: <b>${escapeHTML(item.definition)}</b>`;

      $("#feedback").dataset.suggested = suggested;
      showGradeButtons();
    });
    mcBox.appendChild(btn);
  });
}

function renderTypeFromDef(item) {
  $("#typingBox").classList.remove("hidden");

  setPrompt(`
    <div class="big">Type the word</div>
    <div class="sub">${escapeHTML(item.definition)}</div>
    ${item.example ? `<div class="sub">Example: ${escapeHTML(item.example)}</div>` : ""}
  `);

  $("#typingInput").placeholder = "Type the term…";
  $("#typingInput").focus();

  // suggested grade set after submit
  $("#feedback").dataset.suggested = "";
}

function renderTypeFromAudio(item) {
  $("#typingBox").classList.remove("hidden");
  $("#audioRow").classList.remove("hidden");

  setPrompt(`
    <div class="big">Spell what you hear</div>
    <div class="sub">Click <b>Listen</b>, then type the term.</div>
  `);

  $("#typingInput").placeholder = "Type the term…";
  $("#typingInput").focus();

  // auto-speak once (if allowed)
  speak(item.term, 1.0);

  $("#feedback").dataset.suggested = "";
}

function speak(text, rate = 1.0) {
  try {
    if (!("speechSynthesis" in window)) {
      $("#feedback").innerHTML = `<b>Audio not supported</b> in this browser.`;
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    window.speechSynthesis.speak(u);
  } catch {
    // ignore
  }
}

/** ============ Grading / Scheduling (SM-2 style) ============
We map Again/Hard/Good/Easy to a quality score:
Again=1, Hard=3, Good=4, Easy=5
SM-2:
- if q < 3 => reps=0, interval=1
- else reps++, interval = 1 (reps=1), 6 (reps=2), else interval *= EF
- EF updated with standard formula; min 1.3
*/
function applyGrade(item, grade) {
  const s = item.srs || defaultSRS();
  const q = gradeToQuality(grade);

  s.lastReviewed = now();

  if (q < 3) {
    s.reps = 0;
    s.intervalDays = 1;
    s.lapses = (s.lapses ?? 0) + 1;
  } else {
    s.reps = (s.reps ?? 0) + 1;
    if (s.reps === 1) s.intervalDays = 1;
    else if (s.reps === 2) s.intervalDays = 6;
    else s.intervalDays = Math.round((s.intervalDays ?? 6) * (s.ef ?? 2.5));
  }

  // EF update (SM-2)
  const ef = (s.ef ?? 2.5) + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  s.ef = clamp(ef, 1.3, 2.7);

  // small adjustment if hint/reveal used
  if (session?.hintUsed && q > 3) {
    s.intervalDays = Math.max(1, Math.floor(s.intervalDays * 0.7));
  }
  if (session?.revealed && grade !== "easy" && grade !== "good") {
    // no extra, already accounted via grade
  }

  s.due = now() + (s.intervalDays * DAY);

  item.srs = s;
}

function gradeToQuality(grade) {
  switch (grade) {
    case "again": return 1;
    case "hard": return 3;
    case "good": return 4;
    case "easy": return 5;
    default: return 4;
  }
}

/** ============ Typing handlers ============
*/
function checkTypingAnswer() {
  if (!session?.current) return;
  const item = session.current;
  const ans = $("#typingInput").value;

  const correct = norm(ans) === norm(item.term);
  session.revealed = true;

  if (correct) {
    $("#feedback").innerHTML = `<b>Correct.</b> ${item.definition ? `<span class="muted">${escapeHTML(item.definition)}</span>` : ""}`;
    $("#feedback").dataset.suggested = session.hintUsed ? "hard" : "good";
  } else {
    $("#feedback").innerHTML = `<b>Not quite.</b> Correct spelling: <b>${escapeHTML(item.term)}</b>`;
    $("#feedback").dataset.suggested = "again";
  }

  $("#typingInput").disabled = true;
  showGradeButtons();
}

function useHint() {
  if (!session?.current) return;
  const item = session.current;
  session.hintUsed = true;
  const first = (item.term || "").trim().slice(0, 1);
  $("#feedback").innerHTML = `<span class="muted">Hint: starts with <b>${escapeHTML(first || "?")}</b></span>`;
}

function revealAnswer() {
  if (!session?.current) return;
  const item = session.current;
  session.revealed = true;
  $("#typingInput").value = item.term;
  $("#typingInput").disabled = true;
  $("#feedback").innerHTML = `<b>Revealed.</b> Try to recall it faster next time.`;
  $("#feedback").dataset.suggested = "again";
  showGradeButtons();
}

/** ============ Helpers ============
*/
function shuffleArray(arr) {
  const a = arr.slice();
  shuffleInPlace(a);
  return a;
}
function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}
function escapeHTML(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[c]));
}

/** ============ Wire up events ============
*/
function renderAll() {
  renderTeacher();
  $("#studyDeckTitle").value = activeDeck().title;
  renderStats();
}

function init() {
  // tabs
  $$(".tab").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // teacher
  $("#btnAddItem").addEventListener("click", addItemFromForm);
  $("#btnClearForm").addEventListener("click", () => {
    $("#termInput").value = "";
    $("#defInput").value = "";
    $("#exInput").value = "";
    $("#termInput").focus();
  });

  $("#btnSaveDeckTitle").addEventListener("click", () => {
    const t = $("#deckTitle").value.trim() || "My Vocabulary Deck";
    activeDeck().title = t;
    saveState();
    renderAll();
  });

  $("#btnNewDeck").addEventListener("click", () => {
    const id = uid();
    state.decks[id] = { id, title: "New Deck", createdAt: now(), items: [] };
    state.activeDeckId = id;
    saveState();
    renderAll();
  });

  $("#searchItems").addEventListener("input", renderTeacher);
  $("#btnResetProgress").addEventListener("click", resetProgress);

  $("#btnExportDeck").addEventListener("click", exportDeckJSON);
  $("#btnExportCSV").addEventListener("click", exportDeckCSV);

  $("#importFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importDeckFile(file);
    } catch (err) {
      alert("Import failed: " + String(err));
    } finally {
      e.target.value = "";
    }
  });

  // student
  $("#btnStartStudy").addEventListener("click", () => startStudy({ ahead: false }));
  $("#btnStudyAhead").addEventListener("click", () => startStudy({ ahead: true }));

  $("#btnSubmitTyping").addEventListener("click", checkTypingAnswer);
  $("#typingInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      checkTypingAnswer();
    }
  });

  $("#btnHint").addEventListener("click", useHint);
  $("#btnReveal").addEventListener("click", revealAnswer);

  $("#btnSpeak").addEventListener("click", () => {
    if (!session?.current) return;
    speak(session.current.term, 1.0);
  });
  $("#btnSpeakSlow").addEventListener("click", () => {
    if (!session?.current) return;
    speak(session.current.term, 0.8);
  });

  $("#gradeRow").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-grade]");
    if (!btn || !session?.current) return;

    const grade = btn.dataset.grade;
    applyGrade(session.current, grade);
    saveState();

    $("#feedback").innerHTML += `<div class="muted small">Next review: <b>${fmtDue(session.current.srs.due)}</b> • interval ${session.current.srs.intervalDays} day(s)</div>`;
    $("#gradeRow").classList.add("hidden");
    $("#btnNext").classList.remove("hidden");
  });

  $("#btnNext").addEventListener("click", () => {
    if (!session) return;
    session.idx += 1;
    nextCard();
  });

  $("#btnQuit").addEventListener("click", () => {
    session = null;
    $("#studyUI").classList.add("hidden");
    $("#studyEmpty").classList.remove("hidden");
    $("#studyEmpty").textContent = "Session ended. Click Start to begin again.";
    renderStats();
    saveState();
  });

  renderAll();
}

init();
