// -----------------------------------------------------
// CHALKBOARDAI – MANUAL ANONYMISATION FLOW
// -----------------------------------------------------
// Flow:
// 1) User uploads CSV -> raw table rendered
// 2) User clicks "Check for names"
// 3) System detects a likely name column + scans for names elsewhere
// 4) If names found outside the name column -> warn and block anonymise
// 5) If clear -> "You're good to go!" and enable "Anonymise"
// 6) User clicks "Anonymise"
// 7) Data is pseudonymised and ready for backend
// -----------------------------------------------------

// ---------- Global state ----------

let originalRows = [];       // Raw parsed rows from CSV
let anonymisedRows = [];     // Rows with pseudonyms applied
let realToPseudo = {};       // { "Alice Smith": "Anon-1", ... }
let pseudoToReal = {};       // { "Anon-1": "Alice Smith", ... }
let nameColumnKey = null;    // Header of the detected name column
let nameCheckPassed = false; // Only true after a clean "check for names"
let showingPseudonyms = true;

const NAME_COLUMN_CANDIDATES = [
  "name",
  "pupil",
  "pupil name",
  "student",
  "child",
  "full name"
];

// ---------- DOM wiring ----------

document.addEventListener("DOMContentLoaded", () => {
    const fileInput        = document.getElementById("csvFileInput");
    const checkNamesButton = document.getElementById("checkNamesButton");
    const anonymiseButton  = document.getElementById("anonymiseButton");
    const toggleNamesButton = document.getElementById("toggleNamesButton");
    const loadTimetableButton = document.getElementById("loadTimetableButton");
    const generatePlanButton = document.getElementById("generatePlanButton");

      if (generatePlanButton) {
  generatePlanButton.addEventListener("click", async () => {
    const planStatus = document.getElementById("planStatus");
    const planOutput = document.getElementById("planOutput");

    if (planOutput) planOutput.textContent = "";

    const payload = buildRotaPayload();
    if (!payload) {
      // buildRotaPayload already set a status message
      return;
    }

    if (planStatus) {
      planStatus.textContent = "Generating intervention plan… (this may take a few seconds)";
    }

    try {
      const response = await fetch("/.netlify/functions/suggestRota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (planOutput) {
        planOutput.textContent = data.plan || "No plan text returned from backend.";
      }

      if (planStatus) {
        planStatus.textContent = "Intervention plan generated (prototype).";
      }
    } catch (err) {
      console.error("Error calling suggestRota function:", err);
      if (planStatus) {
        planStatus.textContent = "There was a problem generating the plan. Please try again or check the console.";
      }
    }
  });
}


  if (loadTimetableButton) {
    loadTimetableButton.addEventListener("click", () => {
      renderTimetableGrid(SAMPLE_TIMETABLE);
    });
  }

  if (!fileInput) {
    console.warn("[ChalkboardAI] csvFileInput not found in DOM.");
    return;
  }

  // STEP 1: User uploads class record and it renders, raw.
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    resetState();
    handleCsvUploadRaw(file);
  });

  // STEP 2 / 3 / 4 / 5: User clicks "Check for names"
  if (checkNamesButton) {
    checkNamesButton.addEventListener("click", () => {
      if (!originalRows.length) {
        updateStatus("Please upload a class record first.");
        return;
      }
      performNameCheck();
    });
  }

  // STEP 6 / 7: User clicks "Anonymise"
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
    });
  }

  if (toggleNamesButton) {
    toggleNamesButton.addEventListener("click", () => {
      showingPseudonyms = !showingPseudonyms;
      updateToggleButtonLabel();
      renderTable();
    });
  }
});

// ---------- Step 1: upload + raw render ----------

function handleCsvUploadRaw(file) {
  updateStatus("Parsing CSV…");

  Papa.parse(file, {
    header: true,
    skipEmptyLines: true,
    complete: (results) => {
      if (!results.data || results.data.length === 0) {
        updateStatus("No data found in the file. Please check your CSV.");
        return;
      }

      originalRows = results.data;
      anonymisedRows = []; // cleared until we anonymise

      // Render raw data exactly as uploaded
      showingPseudonyms = false;
      renderTable();

      enableButton("checkNamesButton", true);
      enableButton("anonymiseButton", false);
      hideToggleButton();

      updateStatus("Class record loaded. Please click 'Check for names' to continue.");
    },
    error: (err) => {
      console.error("[ChalkboardAI] PapaParse error:", err);
      updateStatus("There was a problem parsing the CSV. Please try again.");
    }
  });
}

// ---------- Step 2–5: check for names ----------

function performNameCheck() {
  const fields = originalRows.length ? Object.keys(originalRows[0]) : [];
  if (!fields.length) {
    updateStatus("No columns detected. Please check your CSV format.");
    return;
    console.log("Scanning cell:", cellValue);
console.log("IsMatch:", isName(cellValue));
  }

  nameColumnKey = detectNameColumn(fields);
    console.log("Detected name column:", nameColumnKey);
  if (!nameColumnKey) {
    updateStatus(
      "I couldn't detect a name column. " +
      "Please ensure your file has a clear pupil name column " +
      "(e.g. 'Name', 'Pupil Name') and reupload."
    );
    nameCheckPassed = false;
    enableButton("anonymiseButton", false);
    return;
  }

  const flaggedCells = findUnexpectedNames(nameColumnKey);
  console.log("Flagged cells:", flaggedCells);
  if (flaggedCells.length === 0) {
    nameCheckPassed = true;
    enableButton("anonymiseButton", true);

    updateStatus(
      `Name column detected: "${nameColumnKey}". ` +
      "No additional names detected in other columns. You're good to go! " +
      "Click 'Anonymise' when you're ready."
    );
  } else {
    nameCheckPassed = false;
    enableButton("anonymiseButton", false);

    const preview = flaggedCells.slice(0, 5).map(cell =>
      `Row ${cell.rowNumber}, column "${cell.columnKey}" (value: "${cell.value}")`
    );

    updateStatus(
      `Name column detected: "${nameColumnKey}".\n\n` +
      "However, I also found possible pupil names in other columns:\n" +
      preview.join("\n") +
      "\n\nPlease correct these cells in your file and reupload before continuing."
    );
  }
}

function detectNameColumn(fields) {
  const lowerFields = fields.map((f) => f.toLowerCase().trim());

  // Try direct matches
  for (const candidate of NAME_COLUMN_CANDIDATES) {
    const index = lowerFields.indexOf(candidate);
    if (index !== -1) {
      return fields[index];
    }
  }

  // Fallback: anything containing "name"
  for (let i = 0; i < lowerFields.length; i++) {
    if (lowerFields[i].includes("name")) {
      return fields[i];
    }
  }

  return null;
}

// Scan for any cells outside the main name column that exactly match a pupil name.
function findUnexpectedNames(nameCol) {
  const flagged = [];

  // Build a set of all pupil names in the name column
  const pupilNames = new Set();
  originalRows.forEach((row) => {
    const val = (row[nameCol] || "").trim();
    if (val) pupilNames.add(val);
  });

  if (!pupilNames.size) return flagged;

  const fields = Object.keys(originalRows[0] || {});

  originalRows.forEach((row, rowIndex) => {
    fields.forEach((fieldKey) => {
      if (fieldKey === nameCol) return; // allowed here

      const raw = (row[fieldKey] || "").trim();
      if (!raw) return;

      if (pupilNames.has(raw)) {
        flagged.push({
          rowNumber: rowIndex + 2, // +1 for header row, +1 for 1-based index
          columnKey: fieldKey,
          value: raw
        });
      }
    });
  });

  return flagged;
}

// ---------- Step 6–7: anonymise data ----------

function anonymiseData() {
  if (!nameColumnKey) {
    updateStatus("No name column detected. Please run 'Check for names' first.");
    return;
  }

  buildPseudonymMaps(nameColumnKey);
  buildAnonymisedRows(nameColumnKey);

  showingPseudonyms = true;
  renderTable();
  showToggleButton();
  updateToggleButtonLabel();

    updateStatus(
    `Anonymisation complete. ` +
    `Replaced ${Object.keys(realToPseudo).length} pupil names with pseudonyms. ` +
    "This anonymised dataset is now safe to send to the AI backend. " +
    "You can toggle between real and anonymised names on this device only."
  );

  enableButton("generatePlanButton", true);
}


function buildPseudonymMaps(nameCol) {
  realToPseudo = {};
  pseudoToReal = {};

  const uniqueNames = new Set();

  for (const row of originalRows) {
    const rawName = (row[nameCol] || "").trim();
    if (!rawName) continue;
    uniqueNames.add(rawName);
  }

  let counter = 1;
  for (const realName of uniqueNames) {
    const pseudo = `Anon-${counter}`;
    realToPseudo[realName] = pseudo;
    pseudoToReal[pseudo] = realName;
    counter++;
  }
}

function buildAnonymisedRows(nameCol) {
  anonymisedRows = originalRows.map((row) => {
    const copy = { ...row };
    const rawName = (row[nameCol] || "").trim();
    if (rawName && realToPseudo[rawName]) {
      copy[nameCol] = realToPseudo[rawName];
    }
    return copy;
  });
}

// ---------- Table rendering (raw vs anonymised) ----------

function renderTable() {
  const container = document.getElementById("table-container");
  if (!container) {
    console.warn("[ChalkboardAI] table-container not found in DOM.");
    return;
  }

  const rowsToRender =
    showingPseudonyms && anonymisedRows.length ? anonymisedRows : originalRows;

  if (!rowsToRender || rowsToRender.length === 0) {
    container.innerHTML = "<p>No data to display yet.</p>";
    return;
  }

  const fields = Object.keys(rowsToRender[0] || {});
  if (fields.length === 0) {
    container.innerHTML = "<p>Data could not be read. Please check the file format.</p>";
    return;
  }

  let html = "<table class='chalkboard-table'>";
  html += "<thead><tr>";
  fields.forEach((field) => {
    html += `<th>${escapeHtml(field)}</th>`;
  });
  html += "</tr></thead>";

  html += "<tbody>";
  rowsToRender.forEach((row) => {
    html += "<tr>";
    fields.forEach((field) => {
      const value = row[field] != null ? String(row[field]) : "";
      html += `<td>${escapeHtml(value)}</td>`;
    });
    html += "</tr>";
  });
  html += "</tbody></table>";

  container.innerHTML = html;
}

// ---------- UI helpers ----------

function updateStatus(message) {
  const statusBox = document.getElementById("statusBox");
  if (statusBox) {
    statusBox.textContent = message;
  } else {
    console.log("[ChalkboardAI STATUS]", message);
  }
}

function enableButton(id, enabled) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = !enabled;
}

function showToggleButton() {
  const toggleButton = document.getElementById("toggleNamesButton");
  if (toggleButton) {
    toggleButton.style.display = "inline-block";
  }
}

function hideToggleButton() {
  const toggleButton = document.getElementById("toggleNamesButton");
  if (toggleButton) {
    toggleButton.style.display = "none";
  }
}

function updateToggleButtonLabel() {
  const toggleButton = document.getElementById("toggleNamesButton");
  if (!toggleButton) return;

  toggleButton.textContent = showingPseudonyms
    ? "Show real names"
    : "Show anonymised names";
}

function resetState() {
  originalRows = [];
  anonymisedRows = [];
  realToPseudo = {};
  pseudoToReal = {};
  nameColumnKey = null;
  nameCheckPassed = false;
  showingPseudonyms = false;

  enableButton("checkNamesButton", false);
  enableButton("anonymiseButton", false);
  hideToggleButton();
  const container = document.getElementById("table-container");
  if (container) container.innerHTML = "";
}

// Basic HTML escaping for table cells
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// -----------------------------------------------------
// SAMPLE TIMETABLE DATA (hard-wired for now)
// -----------------------------------------------------

// Days shown in the timetable grid
const TIMETABLE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

// Support states for each session cell (cycles on click)
const SUPPORT_STATES = [
  { key: "unset",    label: "No support",       emoji: ""    },
  { key: "partial",  label: "Teacher flexible", emoji: "🟡" },
  { key: "one_adult", label: "1 adult",      emoji: "🟢" },
  { key: "two_plus", label: "2+ adults",     emoji: "🔵" }
];

// Stores support state per session id: { "mon_spell": 2, ... }
const SESSION_SUPPORT = {};

const SAMPLE_TIMETABLE = [
  // MONDAY
  { id: "mon_reg_am",   day: "Mon", start: "08:40", end: "09:00", label: "Registration" },
  { id: "mon_assembly", day: "Mon", start: "09:00", end: "09:20", label: "Assembly" },
  { id: "mon_spell",    day: "Mon", start: "09:20", end: "09:40", label: "Spelling" },
  { id: "mon_write",    day: "Mon", start: "09:40", end: "10:45", label: "Writing" },
  { id: "mon_break",    day: "Mon", start: "10:45", end: "11:00", label: "Break" },
  { id: "mon_maths",    day: "Mon", start: "11:00", end: "12:00", label: "Maths" },
  { id: "mon_reading",  day: "Mon", start: "12:00", end: "12:15", label: "Reading" },
  { id: "mon_lunch",    day: "Mon", start: "12:15", end: "13:00", label: "Lunch" },
  { id: "mon_reg_pm",   day: "Mon", start: "13:00", end: "13:15", label: "Afternoon registration" },
  { id: "mon_number",   day: "Mon", start: "13:15", end: "13:45", label: "Number Sense" },
  { id: "mon_pm1",      day: "Mon", start: "13:45", end: "14:15", label: "Afternoon Session 1" },
  { id: "mon_pm2",      day: "Mon", start: "14:15", end: "15:00", label: "Afternoon Session 2" },
  { id: "mon_reader",   day: "Mon", start: "15:00", end: "15:20", label: "Class Reader" },

  // TUESDAY (you can adjust subjects if yours differ)
  { id: "tue_reg_am",   day: "Tue", start: "08:40", end: "09:00", label: "Registration" },
  { id: "tue_assembly", day: "Tue", start: "09:00", end: "09:20", label: "Assembly" },
  { id: "tue_spell",    day: "Tue", start: "09:20", end: "09:40", label: "Spelling" },
  { id: "tue_write",    day: "Tue", start: "09:40", end: "10:45", label: "Writing" },
  { id: "tue_break",    day: "Tue", start: "10:45", end: "11:00", label: "Break" },
  { id: "tue_maths",    day: "Tue", start: "11:00", end: "12:00", label: "Maths" },
  { id: "tue_reading",  day: "Tue", start: "12:00", end: "12:15", label: "Reading" },
  { id: "tue_lunch",    day: "Tue", start: "12:15", end: "13:00", label: "Lunch" },
  { id: "tue_reg_pm",   day: "Tue", start: "13:00", end: "13:15", label: "Afternoon registration" },
  { id: "tue_number",   day: "Tue", start: "13:15", end: "13:45", label: "Number Sense" },
  { id: "tue_pm1",      day: "Tue", start: "13:45", end: "14:15", label: "Afternoon Session 1" },
  { id: "tue_pm2",      day: "Tue", start: "14:15", end: "15:00", label: "Afternoon Session 2" },
  { id: "tue_reader",   day: "Tue", start: "15:00", end: "15:20", label: "Class Reader" },

  // WEDNESDAY
  { id: "wed_reg_am",   day: "Wed", start: "08:40", end: "09:00", label: "Registration" },
  { id: "wed_assembly", day: "Wed", start: "09:00", end: "09:20", label: "Assembly" },
  { id: "wed_spell",    day: "Wed", start: "09:20", end: "09:40", label: "Spelling" },
  { id: "wed_write",    day: "Wed", start: "09:40", end: "10:45", label: "Writing" },
  { id: "wed_break",    day: "Wed", start: "10:45", end: "11:00", label: "Break" },
  { id: "wed_maths",    day: "Wed", start: "11:00", end: "12:00", label: "Maths" },
  { id: "wed_reading",  day: "Wed", start: "12:00", end: "12:15", label: "Reading" },
  { id: "wed_lunch",    day: "Wed", start: "12:15", end: "13:00", label: "Lunch" },
  { id: "wed_reg_pm",   day: "Wed", start: "13:00", end: "13:15", label: "Afternoon registration" },
  { id: "wed_number",   day: "Wed", start: "13:15", end: "13:45", label: "Number Sense" },
  { id: "wed_pm1",      day: "Wed", start: "13:45", end: "14:15", label: "Afternoon Session 1" },
  { id: "wed_pm2",      day: "Wed", start: "14:15", end: "15:00", label: "Afternoon Session 2" },
  { id: "wed_reader",   day: "Wed", start: "15:00", end: "15:20", label: "Class Reader" },

  // THURSDAY
  { id: "thu_reg_am",   day: "Thu", start: "08:40", end: "09:00", label: "Registration" },
  { id: "thu_assembly", day: "Thu", start: "09:00", end: "09:20", label: "Assembly" },
  { id: "thu_spell",    day: "Thu", start: "09:20", end: "09:40", label: "Spelling" },
  { id: "thu_write",    day: "Thu", start: "09:40", end: "10:45", label: "Writing" },
  { id: "thu_break",    day: "Thu", start: "10:45", end: "11:00", label: "Break" },
  { id: "thu_maths",    day: "Thu", start: "11:00", end: "12:00", label: "Maths" },
  { id: "thu_reading",  day: "Thu", start: "12:00", end: "12:15", label: "Reading" },
  { id: "thu_lunch",    day: "Thu", start: "12:15", end: "13:00", label: "Lunch" },
  { id: "thu_reg_pm",   day: "Thu", start: "13:00", end: "13:15", label: "Afternoon registration" },
  { id: "thu_number",   day: "Thu", start: "13:15", end: "13:45", label: "Number Sense" },
  { id: "thu_pm1",      day: "Thu", start: "13:45", end: "14:15", label: "Afternoon Session 1" },
  { id: "thu_pm2",      day: "Thu", start: "14:15", end: "15:00", label: "Afternoon Session 2" },
  { id: "thu_reader",   day: "Thu", start: "15:00", end: "15:20", label: "Class Reader" },

  // FRIDAY
  { id: "fri_reg_am",   day: "Fri", start: "08:40", end: "09:00", label: "Registration" },
  { id: "fri_assembly", day: "Fri", start: "09:00", end: "09:20", label: "Assembly" },
  { id: "fri_spell",    day: "Fri", start: "09:20", end: "09:40", label: "Spelling" },
  { id: "fri_write",    day: "Fri", start: "09:40", end: "10:45", label: "Writing" },
  { id: "fri_break",    day: "Fri", start: "10:45", end: "11:00", label: "Break" },
  { id: "fri_maths",    day: "Fri", start: "11:00", end: "12:00", label: "Maths" },
  { id: "fri_reading",  day: "Fri", start: "12:00", end: "12:15", label: "Reading (flexible)" },
  { id: "fri_lunch",    day: "Fri", start: "12:15", end: "13:00", label: "Lunch" },
  { id: "fri_reg_pm",   day: "Fri", start: "13:00", end: "13:15", label: "Afternoon registration" },
  { id: "fri_number",   day: "Fri", start: "13:15", end: "13:45", label: "Number Sense" },
  { id: "fri_pm1",      day: "Fri", start: "13:45", end: "14:15", label: "Afternoon Session 1" },
  { id: "fri_pm2",      day: "Fri", start: "14:15", end: "15:00", label: "Afternoon Session 2" },
  { id: "fri_reader",   day: "Fri", start: "15:00", end: "15:20", label: "Class Reader" }
];

// -----------------------------------------------------
// TIMETABLE RENDERING – GRID VIEW WITH CLICKABLE CELLS
// -----------------------------------------------------

function renderTimetableGrid(sessions) {
  const container = document.getElementById("timetable-grid");
  const statusEl  = document.getElementById("timetableStatus");

  if (!container) {
    console.warn("[ChalkboardAI] timetable-grid not found in DOM.");
    return;
  }

  if (!sessions || !sessions.length) {
    container.innerHTML = "<p>No timetable data to display.</p>";
    if (statusEl) statusEl.textContent = "No timetable data.";
    return;
  }

  if (statusEl) {
    statusEl.textContent = "Sample timetable loaded (click a cell to tag support).";
  }

  // 1) Build a list of unique time slots in order
  const seenSlots = new Set();
  const timeSlots = []; // { start, end }

  sessions.forEach((session) => {
    const key = `${session.start}-${session.end}`;
    if (!seenSlots.has(key)) {
      seenSlots.add(key);
      timeSlots.push({ start: session.start, end: session.end });
    }
  });

  // 2) Build the grid table: times down the left, days as columns
  let html = "<table class='chalkboard-table timetable-grid'><thead><tr>";

  // Top-left corner cell
  html += "<th>Time</th>";

  // Day headers
  TIMETABLE_DAYS.forEach((day) => {
    html += `<th>${escapeHtml(day)}</th>`;
  });

  html += "</tr></thead><tbody>";

  // 3) One row per time slot
  timeSlots.forEach((slot) => {
    const timeRange = `${slot.start}–${slot.end}`;
    html += "<tr>";

    // First cell: time range
    html += `<td>${escapeHtml(timeRange)}</td>`;

    // Then one cell per day
    TIMETABLE_DAYS.forEach((day) => {
      const match = sessions.find(
        (s) =>
          s.day === day &&
          s.start === slot.start &&
          s.end === slot.end
      );

      if (match) {
        // Ensure we have some support state index for this id
        const supportIndex = SESSION_SUPPORT[match.id] ?? 0;
        const supportState = SUPPORT_STATES[supportIndex] || SUPPORT_STATES[0];

        const label = match.label || "";
        let supportHtml = "";

        if (supportState.emoji) {
          supportHtml = `<div class="support-indicator">${supportState.emoji} ${escapeHtml(supportState.label)}</div>`;
        }

        html += `
          <td 
            class="timetable-cell" 
            data-session-id="${escapeHtml(match.id)}"
          >
            <div class="session-label">${escapeHtml(label)}</div>
            ${supportHtml}
          </td>
        `;
      } else {
        // No session at this time on this day
        html += `<td class="timetable-cell empty-cell"></td>`;
      }
    });

    html += "</tr>";
  });

  html += "</tbody></table>";

  container.innerHTML = html;

  // 4) After inserting the HTML, attach click handlers to cells
  attachTimetableCellHandlers();
}

// -----------------------------------------------------
// CLICK HANDLERS FOR TIMETABLE CELLS
// -----------------------------------------------------

function attachTimetableCellHandlers() {
  const cells = document.querySelectorAll("#timetable-grid td[data-session-id]");

  cells.forEach((cell) => {
    cell.addEventListener("click", () => {
      const sessionId = cell.getAttribute("data-session-id");
      if (!sessionId) return;

      cycleSessionSupport(sessionId);
    });
  });
}

function cycleSessionSupport(sessionId) {
  // Current index in SUPPORT_STATES (default 0)
  const currentIndex = SESSION_SUPPORT[sessionId] ?? 0;
  const nextIndex = (currentIndex + 1) % SUPPORT_STATES.length;

  SESSION_SUPPORT[sessionId] = nextIndex;

  // Re-render the grid so the badge/emoji updates
  renderTimetableGrid(SAMPLE_TIMETABLE);
}

// -----------------------------------------------------
// BUILD PAYLOAD FOR BACKEND (prototype)
// -----------------------------------------------------

function buildRotaPayload() {
  const planStatus = document.getElementById("planStatus");

  if (!anonymisedRows || !anonymisedRows.length) {
    if (planStatus) {
      planStatus.textContent = "Please upload your class record and anonymise it before generating a plan.";
    }
    return null;
  }

  if (!SAMPLE_TIMETABLE || !SAMPLE_TIMETABLE.length) {
    if (planStatus) {
      planStatus.textContent = "Timetable not available. Click 'Load sample timetable' first.";
    }
    return null;
  }

  // Build sessions with support info
  const sessionsWithSupport = SAMPLE_TIMETABLE.map((session) => {
    const index = SESSION_SUPPORT[session.id] ?? 0;
    const state = SUPPORT_STATES[index] || SUPPORT_STATES[0];

    return {
      id: session.id,
      day: session.day,
      start: session.start,
      end: session.end,
      label: session.label,
      support_key: state.key,
      support_label: state.label
    };
  });

  const payload = {
    meta: {
      version: "0.1-prototype",
      generated_at: new Date().toISOString()
    },
    pupils: anonymisedRows,     // pseudonymised pupils
    name_column: nameColumnKey, // for your reference
    timetable: sessionsWithSupport
  };

  return payload;
}