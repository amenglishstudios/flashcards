/* Scrambled Essay Builder
   - Sentence rebuild (chunks -> slots)
   - Essay order (sentence cards -> ordered list)
   - Drag/drop + tap-to-place
   - Local progress saved in localStorage
*/

// ==============================
// CONFIG: PASTE YOUR ACTIVITY HERE
// ==============================
const ACTIVITY = {
  title: "Scrambled Essay Activity",
  // Sentences in correct final order:
  sentences: [
    // Example demo (replace with your own)
    "Many people believe school is always the best place to learn.",
    "They may say teachers and classmates help students improve.",
    "However, some students learn better in different ways.",
    "In my opinion, learning should include both structure and choice."
  ],
  // Optional: override chunks per sentence (recommended once you generate)
  // If omitted, chunks will be auto-generated using default chunk sizes.
  chunksBySentence: null
};

// Default chunk size for auto chunking (teacher tools can generate better draft)
const DEFAULT_MIN_WORDS = 3;
const DEFAULT_MAX_WORDS = 4;

// ==============================
// STATE
// ==============================
const LS_KEY = "scrambledEssayProgress_v1";

const state = {
  stage: "sentence", // "sentence" | "essay"
  sentenceIndex: 0,
  // Per sentence: placed chunks (array length = numSlots) storing chunk strings or null
  placed: [],
  // Per sentence: locked boolean once correct
  locked: [],
  // Essay order stage: current order array of sentence indices
  essayOrder: [],
  // UI selection (tap-to-place)
  selectedChunkId: null,
  selectedSentenceCardId: null
};

// ==============================
// HELPERS
// ==============================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}

// Basic sentence split for generator usage (teacher tools suggest one sentence per line)
// Not used for ACTIVITY unless teacher uses generator.
function splitIntoSentences(text) {
  // If one sentence per line, prefer that.
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) return lines;

  // Fallback: naive punctuation split
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function chunkWords(sentence, minWords = DEFAULT_MIN_WORDS, maxWords = DEFAULT_MAX_WORDS) {
  const words = normalizeSpaces(sentence).split(" ");
  const chunks = [];
  let i = 0;

  while (i < words.length) {
    const remaining = words.length - i;

    // pick a size that won't leave an awkward 1-word tail if possible
    let size = minWords + Math.floor(Math.random() * (maxWords - minWords + 1));
    size = Math.min(size, remaining);

    // avoid leaving 1 word at end
    if (remaining - size === 1) {
      size = Math.max(minWords, size - 1);
    }
    chunks.push(words.slice(i, i + size).join(" "));
    i += size;
  }
  return chunks;
}

function getCorrectChunksForSentence(idx) {
  if (ACTIVITY.chunksBySentence && ACTIVITY.chunksBySentence[idx]) {
    return ACTIVITY.chunksBySentence[idx].map(normalizeSpaces);
  }
  return chunkWords(ACTIVITY.sentences[idx], DEFAULT_MIN_WORDS, DEFAULT_MAX_WORDS).map(normalizeSpaces);
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);

    // Basic validation
    if (saved && typeof saved === "object") {
      Object.assign(state, saved);
    }
  } catch (_) {}
}

function saveProgress() {
  localStorage.setItem(LS_KEY, JSON.stringify({
    stage: state.stage,
    sentenceIndex: state.sentenceIndex,
    placed: state.placed,
    locked: state.locked,
    essayOrder: state.essayOrder
  }));
}

function resetAllProgress() {
  localStorage.removeItem(LS_KEY);
  state.stage = "sentence";
  state.sentenceIndex = 0;
  state.placed = [];
  state.locked = [];
  state.essayOrder = [];
  state.selectedChunkId = null;
  state.selectedSentenceCardId = null;
  initState();
  render();
}

function initState() {
  const n = ACTIVITY.sentences.length;
  state.placed = Array.from({ length: n }, () => null);
  state.locked = Array.from({ length: n }, () => false);

  // Initialize placed arrays per sentence with correct slot count
  for (let i = 0; i < n; i++) {
    const correctChunks = getCorrectChunksForSentence(i);
    if (!Array.isArray(state.placed[i]) || state.placed[i]?.length !== correctChunks.length) {
      state.placed[i] = Array.from({ length: correctChunks.length }, () => null);
    }
  }

  if (!Array.isArray(state.essayOrder) || state.essayOrder.length !== n) {
    // default initial order = shuffled indices
    state.essayOrder = shuffle([...Array(n).keys()]);
  }
}

// ==============================
// RENDER
// ==============================
const appEl = document.getElementById("app");
const stageTitleEl = document.getElementById("stageTitle");
const stageDescEl = document.getElementById("stageDesc");
const progressPillEl = document.getElementById("progressPill");

function setNotice(kind, msg) {
  const existing = document.getElementById("notice");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.id = "notice";
  div.className = `notice ${kind || ""}`.trim();
  div.textContent = msg;
  appEl.appendChild(div);
}

function updateHeader() {
  const n = ACTIVITY.sentences.length;
  const done = state.locked.filter(Boolean).length;

  if (state.stage === "sentence") {
    stageTitleEl.textContent = "Sentence Builder";
    stageDescEl.textContent = "Drag chunks into the slots to rebuild the sentence. Or tap a chunk, then tap a slot.";
    progressPillEl.textContent = `Sentences: ${done}/${n}`;
  } else {
    stageTitleEl.textContent = "Essay Builder";
    stageDescEl.textContent = "Drag the sentence cards to create the best essay order. Then check your order.";
    progressPillEl.textContent = `Rebuilt: ${done}/${n}`;
  }
}

function render() {
  appEl.innerHTML = "";
  updateHeader();

  if (state.stage === "sentence") {
    renderSentenceStage();
  } else {
    renderEssayStage();
  }

  saveProgress();
}

function renderSentenceStage() {
  const i = state.sentenceIndex;
  const correctChunks = getCorrectChunksForSentence(i);
  const placed = state.placed[i];
  const locked = state.locked[i];

  // Build list of available chunks = all correct chunks minus placed ones
  const placedSet = new Set(placed.filter(Boolean));
  const available = shuffle(correctChunks.filter(ch => !placedSet.has(ch)));

  const top = document.createElement("div");
  top.className = "row";
  top.innerHTML = `
    <div>
      <div class="muted small">Sentence ${i + 1} of ${ACTIVITY.sentences.length}</div>
      <div class="small muted" style="margin-top:6px;">
        Goal: rebuild the sentence, then move to the next one.
      </div>
    </div>
    <div class="controls" style="margin-top:0;">
      <button class="btn secondary" id="btnPrev" type="button">← Prev</button>
      <button class="btn secondary" id="btnNext" type="button">Next →</button>
    </div>
  `;
  appEl.appendChild(top);

  const grid = document.createElement("div");
  grid.className = "grid2";
  grid.innerHTML = `
    <div class="panel">
      <h2>Chunk Bank</h2>
      <div class="bank" id="bank" aria-label="Chunk bank"></div>
    </div>
    <div class="panel">
      <h2>Sentence Slots</h2>
      <div class="slotbar" id="slots" aria-label="Sentence slots"></div>
    </div>
  `;
  appEl.appendChild(grid);

  const bankEl = grid.querySelector("#bank");
  const slotsEl = grid.querySelector("#slots");

  // Render bank chunks
  available.forEach((text, idx) => {
    const id = `c_${i}_${idx}_${hash(text)}`;
    const chip = document.createElement("div");
    chip.className = "chunk";
    chip.textContent = text;
    chip.setAttribute("draggable", locked ? "false" : "true");
    chip.dataset.chunk = text;
    chip.dataset.chunkid = id;
    chip.tabIndex = locked ? -1 : 0;
    chip.setAttribute("role", "button");
    chip.setAttribute("aria-label", `Chunk: ${text}`);

    if (!locked) {
      chip.addEventListener("click", () => selectChunk(chip));
      chip.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectChunk(chip);
        }
      });

      chip.addEventListener("dragstart", (e) => {
        e.dataTransfer.setData("text/plain", text);
        e.dataTransfer.setData("application/x-chunk", text);
      });
    } else {
      chip.classList.add("locked");
    }

    bankEl.appendChild(chip);
  });

  // Render slots
  correctChunks.forEach((_, slotIndex) => {
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.slot = String(slotIndex);
    slot.tabIndex = locked ? -1 : 0;
    slot.setAttribute("role", "button");
    slot.setAttribute("aria-label", `Slot ${slotIndex + 1}`);

    const current = placed[slotIndex];
    if (current) {
      slot.classList.add("filled");
      slot.textContent = current;

      if (!locked) {
        const x = document.createElement("div");
        x.className = "x";
        x.textContent = "×";
        x.title = "Remove";
        x.addEventListener("click", (e) => {
          e.stopPropagation();
          removeFromSlot(i, slotIndex);
        });
        slot.appendChild(x);
      }
    } else {
      slot.textContent = `Slot ${slotIndex + 1}`;
    }

    if (!locked) {
      // click-to-place
      slot.addEventListener("click", () => {
        if (!state.selectedChunkId) return;
        const chunkText = state.selectedChunkId;
        placeIntoSlot(i, slotIndex, chunkText);
        clearSelectedChunk();
      });

      // drag/drop
      slot.addEventListener("dragover", (e) => e.preventDefault());
      slot.addEventListener("drop", (e) => {
        e.preventDefault();
        const chunkText = e.dataTransfer.getData("application/x-chunk") || e.dataTransfer.getData("text/plain");
        if (chunkText) placeIntoSlot(i, slotIndex, chunkText);
      });

      // keyboard: press Enter/Space to place selected chunk
      slot.addEventListener("keydown", (e) => {
        if ((e.key === "Enter" || e.key === " ") && state.selectedChunkId) {
          e.preventDefault();
          placeIntoSlot(i, slotIndex, state.selectedChunkId);
          clearSelectedChunk();
        }
      });
    }

    slotsEl.appendChild(slot);
  });

  const controls = document.createElement("div");
  controls.className = "controls";
  controls.innerHTML = `
    <button class="btn" id="btnCheck" type="button">Check</button>
    <button class="btn secondary" id="btnHint" type="button">Hint</button>
    <button class="btn ghost" id="btnResetSentence" type="button">Reset Sentence</button>
    <button class="btn secondary" id="btnGoEssay" type="button">Go to Essay Builder</button>
  `;
  appEl.appendChild(controls);

  document.getElementById("btnPrev").onclick = () => {
    state.sentenceIndex = Math.max(0, state.sentenceIndex - 1);
    state.selectedChunkId = null;
    render();
  };
  document.getElementById("btnNext").onclick = () => {
    state.sentenceIndex = Math.min(ACTIVITY.sentences.length - 1, state.sentenceIndex + 1);
    state.selectedChunkId = null;
    render();
  };

  document.getElementById("btnResetSentence").onclick = () => {
    if (state.locked[i]) return;
    state.placed[i] = Array.from({ length: correctChunks.length }, () => null);
    state.selectedChunkId = null;
    render();
  };

  document.getElementById("btnCheck").onclick = () => checkSentence(i);
  document.getElementById("btnHint").onclick = () => hintSentence(i);
  document.getElementById("btnGoEssay").onclick = () => {
    state.stage = "essay";
    state.selectedChunkId = null;
    render();
  };

  if (locked) {
    setNotice("good", "✅ This sentence is correct and locked. Move to the next sentence or the essay builder.");
  } else {
    setNotice("", "Build the sentence by placing each chunk into the slots.");
  }
}

function renderEssayStage() {
  const n = ACTIVITY.sentences.length;

  const intro = document.createElement("div");
  intro.className = "notice";
  intro.textContent = "Tip: You can only do this well after you rebuild the sentences. If you want, go back and finish any unlocked sentences first.";
  appEl.appendChild(intro);

  const grid = document.createElement("div");
  grid.className = "grid2";
  grid.innerHTML = `
    <div class="panel">
      <h2>Sentence Cards (drag to reorder)</h2>
      <div class="cards" id="cards" aria-label="Sentence cards"></div>
    </div>
    <div class="panel">
      <h2>Correct Essay (hidden until checked)</h2>
      <div class="notice warn" id="essayFeedback">Click “Check Order” to see feedback.</div>
      <div class="notice" id="essayPreview" style="display:none;"></div>
    </div>
  `;
  appEl.appendChild(grid);

  const cardsEl = grid.querySelector("#cards");
  const feedbackEl = grid.querySelector("#essayFeedback");
  const previewEl = grid.querySelector("#essayPreview");

  // Render sentence cards in current order
  state.essayOrder.forEach((sentIdx, pos) => {
    const text = buildSentenceFromPlaced(sentIdx) || ACTIVITY.sentences[sentIdx]; // fallback
    const card = document.createElement("div");
    card.className = "carditem";
    card.setAttribute("draggable", "true");
    card.dataset.sentidx = String(sentIdx);
    card.dataset.pos = String(pos);
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Sentence card ${pos + 1}: ${text}`);

    card.textContent = text;

    card.addEventListener("click", () => selectSentenceCard(card));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectSentenceCard(card);
      }
      // keyboard move
      if (e.key === "ArrowUp") {
        e.preventDefault();
        moveCard(pos, Math.max(0, pos - 1));
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveCard(pos, Math.min(n - 1, pos + 1));
      }
    });

    // drag events
    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", String(sentIdx));
      e.dataTransfer.setData("application/x-sentence", String(sentIdx));
    });

    card.addEventListener("dragover", (e) => e.preventDefault());
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      const draggedIdx = parseInt(e.dataTransfer.getData("application/x-sentence") || e.dataTransfer.getData("text/plain"), 10);
      if (Number.isNaN(draggedIdx)) return;

      const targetIdx = parseInt(card.dataset.sentidx, 10);
      reorderBySentenceIndex(draggedIdx, targetIdx);
      render();
    });

    cardsEl.appendChild(card);
  });

  const controls = document.createElement("div");
  controls.className = "controls";
  controls.innerHTML = `
    <button class="btn" id="btnCheckOrder" type="button">Check Order</button>
    <button class="btn secondary" id="btnBackSentences" type="button">Back to Sentences</button>
    <button class="btn ghost" id="btnResetOrder" type="button">Reset Order</button>
  `;
  appEl.appendChild(controls);

  document.getElementById("btnBackSentences").onclick = () => {
    state.stage = "sentence";
    render();
  };

  document.getElementById("btnResetOrder").onclick = () => {
    state.essayOrder = shuffle([...Array(n).keys()]);
    render();
  };

  document.getElementById("btnCheckOrder").onclick = () => {
    const correct = [...Array(n).keys()]; // correct order is sentences[] order
    const isPerfect = state.essayOrder.every((v, idx) => v === correct[idx]);

    // highlight each card correctness by position
    [...cardsEl.children].forEach((cardEl, idx) => {
      cardEl.classList.remove("good", "bad");
      const sentIdx = parseInt(cardEl.dataset.sentidx, 10);
      if (sentIdx === correct[idx]) cardEl.classList.add("good");
      else cardEl.classList.add("bad");
    });

    if (isPerfect) {
      feedbackEl.className = "notice good";
      feedbackEl.textContent = "✅ Perfect! Your essay order matches the correct structure.";
    } else {
      feedbackEl.className = "notice bad";
      feedbackEl.textContent = "Not quite yet. Cards highlighted in red are not in the correct position. Keep revising.";
    }

    // show preview of their current essay
    const essayText = state.essayOrder
      .map(idx => buildSentenceFromPlaced(idx) || ACTIVITY.sentences[idx])
      .join(" ");
    previewEl.style.display = "block";
    previewEl.textContent = essayText;
  };
}

// ==============================
// SENTENCE STAGE ACTIONS
// ==============================
function selectChunk(chipEl) {
  const text = chipEl.dataset.chunk;
  state.selectedChunkId = text;

  // visual selection
  document.querySelectorAll(".chunk").forEach(el => el.classList.remove("selected"));
  chipEl.classList.add("selected");
}

function clearSelectedChunk() {
  state.selectedChunkId = null;
  document.querySelectorAll(".chunk").forEach(el => el.classList.remove("selected"));
}

function placeIntoSlot(sentenceIdx, slotIdx, chunkText) {
  if (state.locked[sentenceIdx]) return;

  // If chunk already placed somewhere else, remove it from that slot first
  const arr = state.placed[sentenceIdx];
  const existingPos = arr.findIndex(v => v === chunkText);
  if (existingPos !== -1) arr[existingPos] = null;

  // If slot already filled, push it back to bank (i.e., clear it)
  arr[slotIdx] = chunkText;

  render();
}

function removeFromSlot(sentenceIdx, slotIdx) {
  if (state.locked[sentenceIdx]) return;
  state.placed[sentenceIdx][slotIdx] = null;
  render();
}

function checkSentence(sentenceIdx) {
  const correct = getCorrectChunksForSentence(sentenceIdx);
  const placed = state.placed[sentenceIdx];

  // mark each slot
  const slotEls = document.querySelectorAll(".slot");
  let allFilled = placed.every(Boolean);

  slotEls.forEach((el, idx) => {
    el.classList.remove("good", "bad");
    if (!placed[idx]) return;
    if (placed[idx] === correct[idx]) el.classList.add("good");
    else el.classList.add("bad");
  });

  if (!allFilled) {
    setNotice("warn", "Finish filling all slots before checking.");
    return;
  }

  const perfect = placed.every((v, idx) => v === correct[idx]);
  if (perfect) {
    state.locked[sentenceIdx] = true;
    setNotice("good", "✅ Correct! This sentence is now locked.");
  } else {
    setNotice("bad", "Not quite. Fix the red slots and check again.");
  }

  saveProgress();
}

function hintSentence(sentenceIdx) {
  const correct = getCorrectChunksForSentence(sentenceIdx);
  const placed = state.placed[sentenceIdx];

  // Find first incorrect or empty slot
  const firstBad = placed.findIndex((v, idx) => v !== correct[idx]);
  if (firstBad === -1) {
    setNotice("good", "✅ Everything is correct already.");
    return;
  }

  const hintChunk = correct[firstBad];

  // If that chunk is placed elsewhere, swap it into the correct slot
  const existingPos = placed.findIndex(v => v === hintChunk);
  if (existingPos !== -1) placed[existingPos] = null;

  placed[firstBad] = hintChunk;

  setNotice("warn", `Hint used: placed the correct chunk into Slot ${firstBad + 1}.`);
  render();
}

function buildSentenceFromPlaced(sentenceIdx) {
  const placed = state.placed[sentenceIdx];
  if (!placed || !placed.every(Boolean)) return null;
  return placed.join(" ").replace(/\s+([,.!?;:])/g, "$1");
}

// ==============================
// ESSAY STAGE ACTIONS
// ==============================
function selectSentenceCard(cardEl) {
  document.querySelectorAll(".carditem").forEach(el => el.classList.remove("selected"));
  cardEl.classList.add("selected");
  state.selectedSentenceCardId = parseInt(cardEl.dataset.sentidx, 10);
}

function reorderBySentenceIndex(draggedIdx, targetIdx) {
  const order = state.essayOrder.slice();
  const from = order.indexOf(draggedIdx);
  const to = order.indexOf(targetIdx);
  if (from === -1 || to === -1) return;

  order.splice(from, 1);
  order.splice(to, 0, draggedIdx);
  state.essayOrder = order;
}

function moveCard(fromPos, toPos) {
  const order = state.essayOrder.slice();
  const [item] = order.splice(fromPos, 1);
  order.splice(toPos, 0, item);
  state.essayOrder = order;
  render();
}

// Simple hash for stable ids
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

// ==============================
// TEACHER TOOLS
// ==============================
function wireTeacherTools() {
  const btn = document.getElementById("btnGenerate");
  const essayEl = document.getElementById("teacherEssay");
  const outEl = document.getElementById("teacherOut");
  const minEl = document.getElementById("minWords");
  const maxEl = document.getElementById("maxWords");

  btn.addEventListener("click", () => {
    const text = (essayEl.value || "").trim();
    if (!text) {
      outEl.value = "Paste an essay first.";
      return;
    }

    const minW = clamp(parseInt(minEl.value, 10) || 3, 2, 8);
    const maxW = clamp(parseInt(maxEl.value, 10) || 4, 2, 8);
    const sentences = splitIntoSentences(text).map(normalizeSpaces);

    const chunksBySentence = sentences.map(s => chunkWords(s, minW, Math.max(minW, maxW)));

    const json = JSON.stringify({
      title: "Scrambled Essay Activity",
      sentences,
      chunksBySentence
    }, null, 2);

    outEl.value = json;
  });
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

// ==============================
// BOOT
// ==============================
document.getElementById("btnResetAll").addEventListener("click", resetAllProgress);

loadProgress();
initState();
render();
wireTeacherTools();
