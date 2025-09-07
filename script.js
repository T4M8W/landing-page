document.querySelectorAll("section").forEach(section => {
  const btn = section.querySelector(".see-more")
  const details = section.querySelector(".details")
  if (!btn || !details) return

  btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true"
    btn.setAttribute("aria-expanded", String(!expanded))
    details.hidden = expanded
    btn.textContent = expanded ? "Click here to see more" : "See less"
  })
})