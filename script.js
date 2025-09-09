document.querySelectorAll("section").forEach(section => {
  const btn = section.querySelector(".see-more");
  const panel = section.querySelector(".details");
  if (!btn || !panel) return;

    if (!btn.dataset.labelClosed) {
    btn.dataset.labelClosed = btn.textContent.trim();
  }

  const open = () => {
    btn.setAttribute("aria-expanded", "true");
    panel.hidden = false;
    // Move focus to panel (make it focusable temporarily)
    panel.tabIndex = -1;
    panel.focus();
    btn.textContent = "See less";
  };

  const close = () => {
    btn.setAttribute("aria-expanded", "false");
    panel.hidden = true;
    btn.textContent = btn.dataset.labelClosed; // ← restore original text
    btn.focus();
  };

  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    expanded ? close() : open();
  });

  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      close();
    }
  });
});

function toggleDropdown() {
  const menu = document.getElementById('dropdown-content');
  const btn = document.querySelector('.dropbtn');
  const isOpen = menu.classList.toggle('show');
  btn.setAttribute('aria-expanded', isOpen);
}

window.addEventListener('click', (event) => {
  // Close if click is outside the dropdown
  const dropdown = document.querySelector('.dropdown');
  if (!dropdown.contains(event.target)) {
    const menu = document.getElementById('dropdown-content');
    const btn = document.querySelector('.dropbtn');
    if (menu.classList.contains('show')) {
      menu.classList.remove('show');
      btn.setAttribute('aria-expanded', 'false');
    }
  }
});
