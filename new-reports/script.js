document.addEventListener("DOMContentLoaded", () => {
  // ====== STATE ======
  let ccrData = [];              // [{ id: 'Anon-01', name: 'Pupil Name', rawRow: {...} }]
  let currentPupilIndex = 0;     // index into ccrData for "next pupil" behaviour

  // ====== STEP HELPERS ======
  const steps = [
    document.getElementById("step-1-upload"),
    document.getElementById("step-2-template"),
    document.getElementById("step-3-tone"),
    document.getElementById("step-4-generate"),
    document.getElementById("step-5-output")
  ];

  function showStep(stepIndex) {
    steps.forEach((step, idx) => {
      step.style.display = idx === stepIndex ? "block" : "none";
    });
  }

  showStep(0); // start at Step 1

  // ====== STEP 1: CCR UPLOAD ======
  const ccrFileInput = document.getElementById("ccrFile");
  const btnParseCCR = document.getElementById("btnParseCCR");
  const ccrPreview = document.getElementById("ccrPreview");
  const ccrPreviewTable = document.getElementById("ccrPreviewTable");
  const btnToTemplate = document.getElementById("btnToTemplate");

  btnParseCCR.addEventListener("click", () => {
    const file = ccrFileInput.files[0];
    if (!file) {
      alert("Please choose a CSV file first.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      // Very simple CSV parsing. You can replace this with PapaParse if you like.
      const rows = text.trim().split(/\r?\n/).map(r => r.split(","));
      const headers = rows[0].map(h => h.trim());
      const dataRows = rows.slice(1);

      // Find a "Name" column if possible
      const nameIndex = headers.findIndex(h => h.toLowerCase() === "name" || h.toLowerCase() === "pupil" || h.toLowerCase() === "pupil name");

      if (nameIndex === -1) {
        alert("Couldn't find a 'Name' or 'Pupil' column in the CSV. Please check your file.");
        return;
      }

      // Build ccrData with simple pseudonyms for now (Anon-01 etc.)
      ccrData = dataRows
        .filter(row => row[nameIndex] && row[nameIndex].trim() !== "")
        .map((row, idx) => {
          const displayName = row[nameIndex].trim();
          const pseudoId = `Anon-${String(idx + 1).padStart(2, "0")}`;

          // Build a simple rawRow object keyed by header
          const rawRow = {};
          headers.forEach((h, i) => { rawRow[h] = row[i] || ""; });

          return {
            id: pseudoId,
            name: displayName,
            rawRow
          };
        });

      if (ccrData.length === 0) {
        alert("No pupil rows found. Please check your CSV.");
        return;
      }

      // Render a simple preview table (pseudonym + name)
      const table = document.createElement("table");
      table.style.width = "100%";
      table.style.borderCollapse = "collapse";
      const headerRow = document.createElement("tr");
      ["Pseudonym", "Name (local only)"].forEach(h => {
        const th = document.createElement("th");
        th.textContent = h;
        th.style.borderBottom = "1px solid #ccc";
        th.style.textAlign = "left";
        th.style.padding = "4px";
        table.appendChild(headerRow);
        headerRow.appendChild(th);
      });

      ccrData.forEach(pupil => {
        const tr = document.createElement("tr");
        const td1 = document.createElement("td");
        const td2 = document.createElement("td");
        td1.textContent = pupil.id;
        td2.textContent = pupil.name;
        [td1, td2].forEach(td => {
          td.style.padding = "4px";
          td.style.borderBottom = "1px solid #eee";
        });
        tr.appendChild(td1);
        tr.appendChild(td2);
        table.appendChild(tr);
      });

      ccrPreviewTable.innerHTML = "";
      ccrPreviewTable.appendChild(table);

      ccrPreview.style.display = "block";
    };

    reader.readAsText(file);
  });

  btnToTemplate.addEventListener("click", () => {
    if (!ccrData.length) {
      alert("Please upload and preview your class record first.");
      return;
    }
    showStep(1);
  });

  // ====== STEP 2: TEMPLATE BUILDER ======
  const sectionList = document.getElementById("sectionList");
  const btnAddSection = document.getElementById("btnAddSection");
  const btnSaveTemplate = document.getElementById("btnSaveTemplate");
  const btnToTone = document.getElementById("btnToTone");

  // Helper to renumber section headers (Section 1, Section 2, etc.)
  function renumberSectionHeaders() {
    const rows = sectionList.querySelectorAll(".section-row");
    rows.forEach((row, idx) => {
      row.dataset.sectionIndex = idx;
      const headerSpan = row.querySelector(".section-row-header span");
      headerSpan.textContent = `Section ${idx + 1}`;
      const nextStepCheckbox = row.querySelector(".section-next-step");
      if (nextStepCheckbox) {
        nextStepCheckbox.id = `section-${idx}-next-step`;
        const label = row.querySelector("label[for^='section-'][for$='-next-step']");
        if (label) {
          label.setAttribute("for", `section-${idx}-next-step`);
        }
      }
    });
  }

  // Clone the first section-row as a template for new sections
  function createSectionRow(name = "", wordCount = 100, includeNextStep = false) {
    const template = sectionList.querySelector(".section-row");
    const clone = template.cloneNode(true);
    const idx = sectionList.querySelectorAll(".section-row").length;

    clone.dataset.sectionIndex = idx;
    clone.querySelector(".section-row-header span").textContent = `Section ${idx + 1}`;

    const nameInput = clone.querySelector(".section-name");
    const wordInput = clone.querySelector(".section-word-count");
    const nextStepCheckbox = clone.querySelector(".section-next-step");

    nameInput.value = name || `Section ${idx + 1}`;
    wordInput.value = wordCount;
    nextStepCheckbox.checked = includeNextStep;

    // Wire up controls
    wireSectionRowControls(clone);

    return clone;
  }

  function wireSectionRowControls(row) {
    const btnUp = row.querySelector(".btn-move-up");
    const btnDown = row.querySelector(".btn-move-down");
    const btnDelete = row.querySelector(".btn-delete-section");

    btnUp.onclick = () => {
      const prev = row.previousElementSibling;
      if (prev && prev.classList.contains("section-row")) {
        sectionList.insertBefore(row, prev);
        renumberSectionHeaders();
      }
    };

    btnDown.onclick = () => {
      const next = row.nextElementSibling;
      if (next && next.classList.contains("section-row")) {
        sectionList.insertBefore(next, row);
        renumberSectionHeaders();
      }
    };

    btnDelete.onclick = () => {
      const rows = sectionList.querySelectorAll(".section-row");
      if (rows.length === 1) {
        alert("You must have at least one section.");
        return;
      }
      row.remove();
      renumberSectionHeaders();
    };
  }

  // Wire the initial section row
  const initialRow = sectionList.querySelector(".section-row");
  if (initialRow) {
    wireSectionRowControls(initialRow);
  }

  btnAddSection.addEventListener("click", () => {
    const newRow = createSectionRow();
    sectionList.appendChild(newRow);
    renumberSectionHeaders();
  });

  btnSaveTemplate.addEventListener("click", () => {
    const template = getCurrentTemplateConfig();
    localStorage.setItem("cbai_report_template", JSON.stringify(template));
    alert("Template saved on this device.");
  });

  function getCurrentTemplateConfig() {
    const rows = sectionList.querySelectorAll(".section-row");
    const sections = [];
    rows.forEach(row => {
      const nameInput = row.querySelector(".section-name");
      const wordInput = row.querySelector(".section-word-count");
      const nextStepCheckbox = row.querySelector(".section-next-step");
      sections.push({
        name: nameInput.value.trim() || "Section",
        wordTarget: Number(wordInput.value) || 100,
        includeNextStep: nextStepCheckbox.checked
      });
    });
    return sections;
  }

  // Optionally load template from localStorage on start
  const savedTemplate = localStorage.getItem("cbai_report_template");
  if (savedTemplate) {
    try {
      const sections = JSON.parse(savedTemplate);
      // Remove the initial row and rebuild
      sectionList.innerHTML = "";
      sections.forEach((s, idx) => {
        if (idx === 0) {
          const base = createSectionRow(s.name, s.wordTarget, s.includeNextStep);
          sectionList.appendChild(base);
        } else {
          const row = createSectionRow(s.name, s.wordTarget, s.includeNextStep);
          sectionList.appendChild(row);
        }
      });
      renumberSectionHeaders();
    } catch (e) {
      console.warn("Could not parse saved template", e);
    }
  }

  btnToTone.addEventListener("click", () => {
    const sections = getCurrentTemplateConfig();
    if (!sections.length) {
      alert("Please add at least one section.");
      return;
    }
    showStep(2);
  });

  // ====== STEP 3: TONE & STYLE ======
  const btnToPupilSelect = document.getElementById("btnToPupilSelect");
  const styleNotesInput = document.getElementById("styleNotes");

  function getSelectedTone() {
    const toneRadios = document.querySelectorAll("input[name='tone']");
    let value = "balanced";
    toneRadios.forEach(r => {
      if (r.checked) value = r.value;
    });
    return value;
  }

  btnToPupilSelect.addEventListener("click", () => {
    // You could validate here if needed
    populatePupilSelect();
    showStep(3);
  });

  // ====== STEP 4: PUPIL SELECT & GENERATE ======
  const pupilSelect = document.getElementById("pupilSelect");
  const btnGenerateReport = document.getElementById("btnGenerateReport");
  const generationStatus = document.getElementById("generationStatus");

  function populatePupilSelect() {
    pupilSelect.innerHTML = "";
    ccrData.forEach((pupil, idx) => {
      const opt = document.createElement("option");
      opt.value = pupil.id;
      opt.textContent = `${pupil.id} – ${pupil.name}`;
      pupilSelect.appendChild(opt);
    });
    currentPupilIndex = 0;
    if (ccrData.length > 0) {
      pupilSelect.value = ccrData[0].id;
    }
  }

  btnGenerateReport.addEventListener("click", () => {
    if (!ccrData.length) {
      alert("No pupils loaded.");
      return;
    }
    const selectedId = pupilSelect.value;
    const pupil = ccrData.find(p => p.id === selectedId);
    if (!pupil) {
      alert("Please select a valid pupil.");
      return;
    }

    const template = getCurrentTemplateConfig();
    const tone = getSelectedTone();
    const styleNotes = styleNotesInput.value.trim();

    const payload = {
      pupilId: pupil.id,            // pseudonym
      pupilName: pupil.name,        // local only, not sent if you anonymise on backend
      pupilData: pupil.rawRow,      // CCR row (you may strip/transform this before sending)
      template,
      tone,
      styleNotes
    };

    // Show "Generating..."
    generationStatus.style.display = "block";

    // === BACKEND CALL PLACEHOLDER ===
    // Replace this with a real fetch to your backend.
    // Example:
    //
    // fetch("/api/generate-report", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify(payload)
    // })
    // .then(res => res.json())
    // .then(data => {
    //   renderReportOutput(pupil, template, data);
    // })
    // .catch(err => {
    //   console.error(err);
    //   alert("There was an error generating the report.");
    // })
    // .finally(() => {
    //   generationStatus.style.display = "none";
    // });

    // For now, we’ll mock a response so you can develop the frontend:
    setTimeout(() => {
          fetch("/.netlify/functions/suggestReports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          return res.text().then((t) => {
            throw new Error(`Server error: ${res.status} ${t}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        // data should be an object like:
        // { "English": "...", "English_next_step": "...", ... }
        renderReportOutput(pupil, template, data);
        showStep(4);
      })
      .catch((err) => {
        console.error(err);
        alert("There was an error generating the report. Please try again.");
      })
      .finally(() => {
        generationStatus.style.display = "none";
      });

      renderReportOutput(pupil, template, fakeSections);
      generationStatus.style.display = "none";
      showStep(4);
    }, 800);
  });

  // ====== STEP 5: OUTPUT & COPY ======
  const reportSectionsContainer = document.getElementById("reportSections");
  const btnCopyAll = document.getElementById("btnCopyAll");
  const btnNextPupil = document.getElementById("btnNextPupil");

  function renderReportOutput(pupil, template, sectionsData) {
    // sectionsData is expected like:
    // { "English": "...", "English_next_step": "...", "Maths": "..." }

    reportSectionsContainer.innerHTML = "";

    template.forEach(sec => {
      const wrapper = document.createElement("div");
      wrapper.className = "report-section";
      wrapper.dataset.sectionName = sec.name;

      const h = document.createElement("h3");
      h.textContent = sec.name;
      wrapper.appendChild(h);

      const commentArea = document.createElement("textarea");
      commentArea.className = "report-text";
      commentArea.value = sectionsData[sec.name] || "";
      wrapper.appendChild(commentArea);

      if (sec.includeNextStep) {
        const fg = document.createElement("div");
        fg.className = "field-group";

        const label = document.createElement("label");
        label.textContent = "Next step";
        fg.appendChild(label);

        const nextArea = document.createElement("textarea");
        nextArea.className = "report-next-step";
        nextArea.value = sectionsData[`${sec.name}_next_step`] || "";
        fg.appendChild(nextArea);

        wrapper.appendChild(fg);
      }

      reportSectionsContainer.appendChild(wrapper);
    });

    // Move to output step
    showStep(4);
  }

  btnCopyAll.addEventListener("click", async () => {
    const sections = reportSectionsContainer.querySelectorAll(".report-section");
    if (!sections.length) {
      alert("No report content to copy.");
      return;
    }

    let combined = "";
    sections.forEach(sec => {
      const title = sec.querySelector("h3").textContent;
      const text = sec.querySelector(".report-text").value.trim();
      const nextStep = sec.querySelector(".report-next-step")
        ? sec.querySelector(".report-next-step").value.trim()
        : "";

      combined += `${title}\n${text}\n`;
      if (nextStep) {
        combined += `Next step: ${nextStep}\n`;
      }
      combined += "\n";
    });

    try {
      await navigator.clipboard.writeText(combined.trim());
      alert("Report copied to clipboard. You can now paste it into your school template.");
    } catch (err) {
      console.error(err);
      alert("Unable to copy to clipboard. Please copy manually.");
    }
  });

  btnNextPupil.addEventListener("click", () => {
    if (!ccrData.length) return;
    currentPupilIndex = (currentPupilIndex + 1) % ccrData.length;
    const nextPupil = ccrData[currentPupilIndex];
    pupilSelect.value = nextPupil.id;
    // Optionally auto-generate for the next pupil:
    // btnGenerateReport.click();
    showStep(3); // go back to pupil selection/generation step
  });
});

