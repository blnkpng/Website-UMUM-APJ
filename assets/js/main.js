const toggle = document.querySelector(".mobile-toggle");
const mobileMenu = document.querySelector("#mobile-menu");
const mobileLinks = document.querySelectorAll(".mobile-menu a");

function setMenu(open) {
  if (!toggle || !mobileMenu) return;
  toggle.classList.toggle("is-open", open);
  mobileMenu.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  mobileMenu.setAttribute("aria-hidden", String(!open));
}

if (toggle && mobileMenu) {
  toggle.addEventListener("click", () => {
    setMenu(!mobileMenu.classList.contains("is-open"));
  });

  mobileLinks.forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!mobileMenu.classList.contains("is-open")) return;
    if (mobileMenu.contains(target) || toggle.contains(target)) return;
    setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setMenu(false);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 940) {
      setMenu(false);
    }
  });
}
