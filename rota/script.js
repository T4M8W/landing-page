"use strict";

/**
 * ---------- Common name detection ----------
 * (Used for scanning the CSV for pupil names)
 */

const COMMON_NAMES = [
  // Top UK-like names – list from your existing file
  "Oliver", "George", "Harry", "Jack", "Jacob", "Noah", "Charlie", "Muhammad",
  "Thomas", "Oscar", "William", "James", "Leo", "Alfie", "Henry", "Joshua",
  "Freddie", "Archie", "Ethan", "Isaac", "Alexander", "Joseph", "Edward",
  "Samuel", "Max", "Daniel", "Arthur", "Lucas", "Mohammed", "Logan",
  "Theodore", "Harrison", "Benjamin", "Mason", "Sebastian", "Finley",
  "Adam", "Dylan", "Zachary", "Riley", "Toby",

  "Olivia", "Amelia", "Isla", "Ava", "Emily", "Isabella", "Mia", "Poppy",
  "Ella", "Lily", "Sophia", "Grace", "Evie", "Scarlett", "Ruby", "Chloe",
  "Isabelle", "Freya", "Charlotte", "Sienna", "Willow", "Phoebe", "Florence",
  "Alice", "Jessica", "Harper", "Matilda", "Daisy", "Erin", "Hannah"
];

const namePattern = new RegExp(
  "\\b(" + COMMON_NAMES.map(n => n.toLowerCase()).join("|") + ")\\b",
  "i"
);

function isName(value) {
  if (!value) return false;
  const cleaned = String(value).toLowerCase().trim();
  return cleaned.length > 1 && namePattern.test(cleaned);
}

/**
 * ---------- Global state ----------
 */

let originalRows = [];       // Raw parsed rows from CSV
let anonymisedRows = [];     // Rows with pseudonyms applied
let realToPseudo = {};       // { "Alice Smith": "Pupil 1", ... }
let pseudoToReal = {};       // { "Pupil 1": "Alice Smith", ... }
let nameColumnKey = null;    // Header of detected name column
let nameCheckPassed = false;
let showingPseudonyms = true;

let currentPlanAnon = "";    // AI response with pseudonyms
let currentPlanReal = "";    // Same response with real names
let showingRealPlan = false;

let highlightedCells = {};   // { rowIndex: { columnKey: true } }

// Timetable / rota state
const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const SUPPORT_STATES = [
  { key: "none",   label: "No support",          className: "support-none"   },
  { key: "yellow", label: "Partial support (🟡)", className: "support-some"   },
  { key: "green",  label: "1 adult (🟢)",        className: "support-one"    },
  { key: "blue",   label: "2+ adults (🔵)",      className: "support-many"   }
];

const SESSION_SUPPORT = {};  // { sessionId: "green" | "blue" | ... }
let CURRENT_TIMETABLE = [];  // array of {id,day,start,end,label,...}

// A simple, known-good timetable for testing
const SAMPLE_TIMETABLE = [
  { id: "mon_0840_0900", day: "Mon", start: "08:40", end: "09:00", label: "Registration" },
  { id: "mon_0900_0915", day: "Mon", start: "09:00", end: "09:15", label: "Assembly" },
  { id: "mon_0915_0935", day: "Mon", start: "09:15", end: "09:35", label: "Spelling" },
  { id: "mon_0935_0945", day: "Mon", start: "09:35", end: "09:45", label: "Writing" },
  { id: "mon_1045_1100", day: "Mon", start: "10:45", end: "11:00", label: "Break" },
  { id: "mon_1100_1200", day: "Mon", start: "11:00", end: "12:00", label: "Maths" },
  { id: "mon_1215_1315", day: "Mon", start: "12:15", end: "13:15", label: "Handwriting" },
  { id: "mon_1315_1500", day: "Mon", start: "13:15", end: "15:00", label: "PSHE" }
];

/**
 * ---------- DOM wiring ----------
 */

document.addEventListener("DOMContentLoaded", () => {
  const fileInput            = document.getElementById("csvFileInput");
  const checkNamesButton     = document.getElementById("checkNamesButton");
  const anonymiseButton      = document.getElementById("anonymiseButton");
  const toggleNamesButton    = document.getElementById("toggleNamesButton");

  const timetableFileInput   = document.getElementById("timetableFileInput");
  const loadTimetableButton  = document.getElementById("loadTimetableButton");
  const timetableTextInput   = document.getElementById("timetableTextInput");
  const extractFromTextButton = document.getElementById("extractFromTextButton");

  const generatePlanButton   = document.getElementById("generatePlanButton");
  const togglePlanButton     = document.getElementById("togglePlanNamesButton");
  const planStatus           = document.getElementById("planStatus");
  const planOutput           = document.getElementById("planOutput");

  // --- Class record upload + anonymisation ---

  if (fileInput) {
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      resetState();
      handleCsvUploadRaw(file, checkNamesButton);
    });
  }

  if (checkNamesButton) {
    checkNamesButton.addEventListener("click", () => {
      if (!originalRows.length) {
        updateStatus("Please upload a class record first.");
        return;
      }
      performNameCheck();
    });
  }

  if (anonymiseButton) {
    anonymiseButton.addEventListener("click", () => {
      if (!originalRows.length) {
        updateStatus("Please upload a class record first.");
        return;
      }
      if (!nameCheckPassed) {
        updateStatus("Please run 'Check for names' and resolve any issues before anonymising.");
        return;
      }

      anonymiseData();
      showingPseudonyms = true;
      renderTable(anonymisedRows, true);
      updateStatus("Data anonymised. You can now generate an intervention plan safely.");
    });
  }

  if (toggleNamesButton) {
    toggleNamesButton.addEventListener("click", () => {
      if (!anonymisedRows.length) return;
      showingPseudonyms = !showingPseudonyms;

      renderTable(showingPseudonyms ? anonymisedRows : originalRows, showingPseudonyms);

      toggleNamesButton.textContent = showingPseudonyms
        ? "Show real names"
        : "Show anonymised names";
    });
  }

  // --- Timetable: CSV upload ---

  if (timetableFileInput) {
    timetableFileInput.addEventListener("change", (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      parseTimetableFile(file);
    });
  }

  if (loadTimetableButton) {
    loadTimetableButton.addEventListener("click", () => {
      renderTimetableGrid(SAMPLE_TIMETABLE);
      const timetableStatus = document.getElementById("timetableStatus");
      if (timetableStatus) {
        timetableStatus.textContent = "Loaded sample timetable. Click cells to tag support.";
      }
    });
  }

  // --- Timetable: AI extraction from pasted text ---

  if (extractFromTextButton && timetableTextInput) {
    extractFromTextButton.addEventListener("click", async () => {
      const rawText = timetableTextInput.value.trim();
      const statusEl = document.getElementById("timetableAiStatus");

      if (!rawText) {
        if (statusEl) statusEl.textContent = "Paste your timetable text first.";
        return;
      }

      if (statusEl) statusEl.textContent = "Asking the AI to read your timetable…";

      try {
        const response = await fetch("/.netlify/functions/extractTimetable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timetable_text: rawText })
        });

        const data = await response.json().catch(() => ({}));
        console.log("AI timetable raw data:", data);

        if (!response.ok) {
          console.error("extractTimetable backend error:", data);
          if (statusEl) {
            statusEl.textContent =
              data && data.error
                ? `AI timetable helper error: ${data.error}`
                : "The AI timetable helper hit an error. Please try again or use the CSV upload.";
          }
          return;
        }

        // Be flexible about shape: either { sessions: [...] } or { result: { sessions: [...] } } or bare array
        const rawSessions =
          Array.isArray(data.sessions)         ? data.sessions :
          Array.isArray(data.result?.sessions) ? data.result.sessions :
          Array.isArray(data)                  ? data :
          [];

        if (!rawSessions.length) {
          if (statusEl) {
            statusEl.textContent =
              "I couldn't extract any sessions from that text. " +
              "You might need to tidy it up or try the CSV upload instead.";
          }
          return;
        }

        const sessions = rawSessions
          .map((session, index) => {
            const day   = normaliseDay(session.day || session.Day || "");
            const start = (session.start || session.Start || "").trim();
            const end   = (session.end   || session.End   || "").trim();
            const label = (session.label || session.Label || "").trim();

            if (!day || !start || !end || !label) return null;

            const id = `${day.toLowerCase()}_${start.replace(":", "")}_${end.replace(":", "")}_${index}`;

            return {
              id,
              day,
              start,
              end,
              label,
              type: "lesson_general",
              suitable_for_withdrawal: true,
              teacher_status: "normal",
              adult_capacity: 1
            };
          })
          .filter(Boolean);

        if (!sessions.length) {
          if (statusEl) {
            statusEl.textContent =
              "The AI replied, but I couldn't turn it into a usable timetable. " +
              "Try simplifying the pasted text or use the CSV upload.";
          }
          return;
        }

        // Clear any previous support tagging
        Object.keys(SESSION_SUPPORT).forEach((key) => delete SESSION_SUPPORT[key]);

        renderTimetableGrid(sessions);

        if (statusEl) {
          statusEl.textContent =
            "Timetable extracted. Check it looks right, then click cells to tag support.";
        }
      } catch (err) {
        console.error("Error calling extractTimetable function:", err);
        const statusEl2 = document.getElementById("timetableAiStatus");
        if (statusEl2) {
          statusEl2.textContent =
            "There was a problem talking to the AI timetable helper. " +
            "Please try again or use the CSV upload.";
        }
      }
    });
  }

  // --- AI rota generation ---

  if (generatePlanButton) {
    generatePlanButton.addEventListener("click", async () => {
      if (planOutput) planOutput.textContent = "";

      const payload = buildRotaPayload();
      if (!payload) return; // buildRotaPayload has already set a status message

      if (planStatus) {
        planStatus.textContent = "Generating intervention plan… (this may take a few seconds).";
      }

      try {
        const response = await fetch("/.netlify/functions/suggestRota", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        currentPlanAnon = data.plan || "No plan text returned from backend.";
        currentPlanReal = reidentifyText(currentPlanAnon);
        showingRealPlan = false;

        if (planOutput) planOutput.textContent = currentPlanAnon;

        if (planStatus) {
          planStatus.textContent = "Intervention plan generated (prototype).";
        }

        if (togglePlanButton) {
          togglePlanButton.disabled = false;
          togglePlanButton.textContent = "Show real pupil names";
        }
      } catch (err) {
        console.error("Error calling suggestRota function:", err);
        if (planStatus) {
          planStatus.textContent =
            "There was a problem generating the plan. Please try again or check the console.";
        }
      }
    });
  }

  if (togglePlanButton) {
    togglePlanButton.addEventListener("click", () => {
      if (!currentPlanAnon) return;

      showingRealPlan = !showingRealPlan;
      if (planOutput) {
        planOutput.textContent = showingRealPlan ? currentPlanReal : currentPlanAnon;
      }

      togglePlanButton.textContent = showingRealPlan
        ? "Show anonymised pupil names"
        : "Show real pupil names";
    });
  }
});

/**
 * ---------- Class record helpers ----------
 */

function resetState() {
  originalRows = [];
  anonymisedRows = [];
  realToPseudo = {};
  pseudoToReal = {};
  nameColumnKey = null;
  nameCheckPassed = false;
  showingPseudonyms = true;
  highlightedCells = {};
  updateStatus("");
  const tableContainer = document.getElementById("table-container");
  if (tableContainer) tableContainer.innerHTML = "";
}

function updateStatus(message) {
  const box = document.getElementById("statusBox");
  if (!box) return;
  box.textContent = message;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function handleCsvUploadRaw(file, checkNamesButton) {
  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      originalRows = results.data.filter(row => Object.values(row).some(v => v !== ""));
      anonymisedRows = [];
      nameCheckPassed = false;
      highlightedCells = {};

      if (checkNamesButton) checkNamesButton.disabled = false;

      renderTable(originalRows, false);
      updateStatus(
        `Loaded ${originalRows.length} rows. Click "Check for names" to scan for pupil names.`
      );
    },
    error: (err) => {
      console.error("CSV parse error:", err);
      updateStatus("There was a problem reading that file. Please check it and try again.");
    }
  });
}

function renderTable(rows, usingPseudonyms) {
  const container = document.getElementById("table-container");
  if (!container) return;

  if (!rows || !rows.length) {
    container.innerHTML = "<p>No rows to display yet.</p>";
    return;
  }

  const headers = Object.keys(rows[0]);
  const table = document.createElement("table");
  table.className = "data-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    headers.forEach((header) => {
      const td = document.createElement("td");
      const value = row[header] ?? "";
      td.innerHTML = escapeHtml(value);

      if (
        highlightedCells[rowIndex] &&
        highlightedCells[rowIndex][header]
      ) {
        td.classList.add("flagged-cell");
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  const toggleBtn = document.getElementById("toggleNamesButton");
  if (toggleBtn && anonymisedRows.length) {
    toggleBtn.style.display = "inline-block";
    toggleBtn.disabled = false;
    toggleBtn.textContent = usingPseudonyms
      ? "Show real names"
      : "Show anonymised names";
  }
}

function detectNameColumn() {
  if (!originalRows.length) return null;

  const sample = originalRows[0];
  const headers = Object.keys(sample);

  // 1) Try explicit "Name"/"Pupil" style headers
  const NAME_COLUMN_CANDIDATES = [
    "name",
    "pupil",
    "pupil name",
    "student",
    "child",
    "full name"
  ];

  let bestHeader = null;

  for (const candidate of NAME_COLUMN_CANDIDATES) {
    const found = headers.find(
      (h) => h && h.toLowerCase().trim() === candidate
    );
    if (found) {
      bestHeader = found;
      break;
    }
  }

  // 2) Fallback: pick the column with most values that "look like" names
  if (!bestHeader) {
    let bestScore = 0;
    headers.forEach((header) => {
      let score = 0;
      originalRows.forEach((row) => {
        if (isName(row[header])) score += 1;
      });
      if (score > bestScore) {
        bestScore = score;
        bestHeader = header;
      }
    });
  }

  return bestHeader;
}

function performNameCheck() {
  nameColumnKey = detectNameColumn();
  highlightedCells = {};

  if (!nameColumnKey) {
    updateStatus(
      "I couldn't reliably detect a name column. Please check your CSV headings."
    );
    renderTable(originalRows, false);
    return;
  }

  originalRows.forEach((row, rowIndex) => {
    const value = row[nameColumnKey];
    if (isName(value)) {
      if (!highlightedCells[rowIndex]) highlightedCells[rowIndex] = {};
      highlightedCells[rowIndex][nameColumnKey] = true;
    }
  });

  const totalFlags = Object.values(highlightedCells).reduce(
    (acc, obj) => acc + Object.keys(obj).length,
    0
  );

  if (!totalFlags) {
    nameCheckPassed = true;
    updateStatus(
      `I couldn't see any obvious names in the "${nameColumnKey}" column. ` +
      "If you're happy with this, you can anonymise."
    );
  } else {
    nameCheckPassed = true;
    updateStatus(
      `I detected ${totalFlags} cell(s) that look like pupil names in the "${nameColumnKey}" column. ` +
      "Please check them, then click Anonymise when you're ready."
    );
  }

  renderTable(originalRows, false);
}

function anonymiseData() {
  if (!nameColumnKey) return;

  realToPseudo = {};
  pseudoToReal = {};
  anonymisedRows = [];

  let counter = 1;

  originalRows.forEach((row) => {
    const cloned = { ...row };
    const originalName = row[nameColumnKey];

    if (originalName && originalName.trim() !== "") {
      let pseudo = realToPseudo[originalName];
      if (!pseudo) {
        pseudo = `Pupil ${counter++}`;
        realToPseudo[originalName] = pseudo;
        pseudoToReal[pseudo] = originalName;
      }
      cloned[nameColumnKey] = pseudo;
    }

    anonymisedRows.push(cloned);
  });
}

function reidentifyText(text) {
  if (!text || !Object.keys(pseudoToReal).length) return text;

  let output = text;
  Object.entries(pseudoToReal).forEach(([pseudo, real]) => {
    const pattern = new RegExp("\\b" + pseudo.replace(/\s+/g, "\\s+") + "\\b", "g");
    output = output.replace(pattern, real);
  });
  return output;
}

/**
 * ---------- Timetable helpers ----------
 */

function normaliseDay(value) {
  if (!value) return "";
  const v = String(value).trim().toLowerCase();

  if (v.startsWith("mon")) return "Mon";
  if (v.startsWith("tue")) return "Tue";
  if (v.startsWith("wed")) return "Wed";
  if (v.startsWith("thu")) return "Thu";
  if (v.startsWith("fri")) return "Fri";

  return v.charAt(0).toUpperCase() + v.slice(1, 3);
}

function renderTimetableGrid(sessions) {
  const container = document.getElementById("timetable-grid");
  const statusBox = document.getElementById("timetableStatus");
  const generatePlanButton = document.getElementById("generatePlanButton");

  if (!container) return;

  if (!sessions || !sessions.length) {
    container.innerHTML = "<p>No timetable loaded yet.</p>";
    if (generatePlanButton) generatePlanButton.disabled = true;
    return;
  }

  CURRENT_TIMETABLE = sessions.slice(); // shallow clone

  // Group by day
  const byDay = {};
  sessions.forEach((s) => {
    const day = s.day || s.Day || "";
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(s);
  });

  TIMETABLE_DAYS.forEach((day) => {
    if (byDay[day]) {
      byDay[day].sort((a, b) => (a.start > b.start ? 1 : -1));
    }
  });

  const table = document.createElement("table");
  table.className = "timetable-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  ["Day", "Start", "End", "Lesson", "Support"].forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  TIMETABLE_DAYS.forEach((day) => {
    const daySessions = byDay[day] || [];
    daySessions.forEach((session) => {
      const tr = document.createElement("tr");

      const dayTd = document.createElement("td");
      dayTd.textContent = day;
      tr.appendChild(dayTd);

      const startTd = document.createElement("td");
      startTd.textContent = session.start;
      tr.appendChild(startTd);

      const endTd = document.createElement("td");
      endTd.textContent = session.end;
      tr.appendChild(endTd);

      const labelTd = document.createElement("td");
      labelTd.textContent = session.label;
      tr.appendChild(labelTd);

      const supportTd = document.createElement("td");
      const stateKey = SESSION_SUPPORT[session.id] || "none";
      const state = SUPPORT_STATES.find((s) => s.key === stateKey) || SUPPORT_STATES[0];

      supportTd.textContent = state.label;
      supportTd.dataset.sessionId = session.id;
      supportTd.dataset.stateKey = state.key;
      supportTd.className = state.className + " support-cell";

      tr.appendChild(supportTd);
      tbody.appendChild(tr);
    });
  });

  table.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(table);

  attachTimetableCellHandlers();

  if (statusBox) {
    statusBox.textContent =
      "Click in the Support column to cycle through support levels (none → 🟡 → 🟢 → 🔵).";
  }

  if (generatePlanButton) {
    generatePlanButton.disabled = false;
  }
}

function attachTimetableCellHandlers() {
  const container = document.getElementById("timetable-grid");
  if (!container) return;

  container.querySelectorAll("td.support-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const sessionId = cell.dataset.sessionId;
      const currentKey = cell.dataset.stateKey || "none";
      cycleSessionSupport(sessionId, currentKey, cell);
    });
  });
}

function cycleSessionSupport(sessionId, currentKey, cell) {
  const index = SUPPORT_STATES.findIndex((s) => s.key === currentKey);
  const next =
    index === -1
      ? SUPPORT_STATES[1] // start at yellow if unknown
      : SUPPORT_STATES[(index + 1) % SUPPORT_STATES.length];

  SESSION_SUPPORT[sessionId] = next.key;
  cell.dataset.stateKey = next.key;
  cell.textContent = next.label;
  cell.className = next.className + " support-cell";
}

function parseTimetableFile(file) {
  const statusBox = document.getElementById("timetableStatus");

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      const rows = results.data.filter(row => Object.values(row).some(v => v !== ""));
      const sessions = rows
        .map((row, index) => {
          const day = normaliseDay(row.Day || row.day || "");
          const start = (row.Start || row.start || "").trim();
          const end = (row.End || row.end || "").trim();
          const label = (row.Label || row.label || "").trim();

          if (!day || !start || !end || !label) return null;

          const id = `${day.toLowerCase()}_${start.replace(":", "")}_${end.replace(":", "")}_${index}`;
          return { id, day, start, end, label };
        })
        .filter(Boolean);

      if (!sessions.length) {
        if (statusBox) {
          statusBox.textContent =
            "I couldn't find any valid rows in that spreadsheet. " +
            "Make sure it has Day, Start, End and Label columns.";
        }
        return;
      }

      // Clear any previous support tagging
      Object.keys(SESSION_SUPPORT).forEach((key) => delete SESSION_SUPPORT[key]);
      renderTimetableGrid(sessions);

      if (statusBox) {
        statusBox.textContent =
          "Timetable loaded. Check it looks right, then click cells to tag support.";
      }
    },
    error: (err) => {
      console.error("Timetable CSV parse error:", err);
      if (statusBox) {
        statusBox.textContent =
          "There was a problem reading that timetable file. Please check it and try again.";
      }
    }
  });
}

/**
 * ---------- Build payload for AI rota ----------
 */

function buildRotaPayload() {
  const planStatus = document.getElementById("planStatus");

  if (!anonymisedRows.length) {
    if (planStatus) {
      planStatus.textContent =
        "Please upload and anonymise your class record before generating a plan.";
    }
    return null;
  }

  if (!CURRENT_TIMETABLE.length) {
    if (planStatus) {
      planStatus.textContent =
        "Please load a timetable (spreadsheet or AI read) before generating a plan.";
    }
    return null;
  }

  const supportTags = Object.entries(SESSION_SUPPORT).map(([sessionId, supportKey]) => {
    const session = CURRENT_TIMETABLE.find((s) => s.id === sessionId);
    if (!session) return null;
    return { ...session, support: supportKey };
  }).filter(Boolean);

  const payload = {
    pupils: anonymisedRows,
    timetable: CURRENT_TIMETABLE,
    support_tags: supportTags
  };

  return payload;
}
