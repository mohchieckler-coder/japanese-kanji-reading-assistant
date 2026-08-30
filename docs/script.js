const header = document.querySelector("[data-header]");
const menuButton = document.querySelector("[data-menu-toggle]");
const navigation = document.querySelector("[data-nav]");
const navigationLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];

function setMenuOpen(open) {
  if (!menuButton || !navigation) {
    return;
  }
  menuButton.setAttribute("aria-expanded", String(open));
  const label = open ? menuButton.dataset.menuCloseLabel : menuButton.dataset.menuOpenLabel;
  if (label) {
    menuButton.setAttribute("aria-label", label);
  }
  navigation.classList.toggle("is-open", open);
  document.body.classList.toggle("menu-open", open);
}

menuButton?.addEventListener("click", () => {
  setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
});

navigationLinks.forEach((link) => {
  link.addEventListener("click", () => setMenuOpen(false));
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && menuButton?.getAttribute("aria-expanded") === "true") {
    setMenuOpen(false);
    menuButton?.focus();
  }
});

document.addEventListener("click", (event) => {
  if (
    menuButton?.getAttribute("aria-expanded") === "true"
    && !navigation?.contains(event.target)
    && !menuButton.contains(event.target)
  ) {
    setMenuOpen(false);
  }
});

const compactNavMaxWidth = document.documentElement.lang === "zh-CN" ? 900 : 1160;
const desktopNavigation = window.matchMedia(`(min-width: ${compactNavMaxWidth + 1}px)`);
desktopNavigation.addEventListener("change", (event) => {
  if (event.matches) {
    setMenuOpen(false);
  }
});

document.documentElement.classList.replace("no-js", "js");

const sharedHomepageHashes = new Set(["top", "product", "features", "privacy", "install", "faq"]);
const homepageLocaleLinks = [...document.querySelectorAll("[data-nav] [data-locale-link]")];
const homepageLocaleHrefs = new Map(
  homepageLocaleLinks.map((link) => [link, link.getAttribute("href")])
);

function preserveHomepageHash() {
  const sectionId = window.location.hash.slice(1);
  const suffix = sharedHomepageHashes.has(sectionId) ? `#${sectionId}` : "";
  homepageLocaleLinks.forEach((link) => {
    link.setAttribute("href", `${homepageLocaleHrefs.get(link)}${suffix}`);
  });
}

window.addEventListener("hashchange", preserveHomepageHash);
preserveHomepageHash();

let scrollFrame = 0;
function updateHeader() {
  scrollFrame = 0;
  header?.classList.toggle("is-scrolled", window.scrollY > 16);
}

window.addEventListener("scroll", () => {
  if (!scrollFrame) {
    scrollFrame = window.requestAnimationFrame(updateHeader);
  }
}, { passive: true });
updateHeader();

const observedSections = navigationLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window) {
  const sectionObserver = new IntersectionObserver((entries) => {
    const activeEntry = entries
      .filter((entry) => entry.isIntersecting)
      .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
    if (!activeEntry) {
      return;
    }
    navigationLinks.forEach((link) => {
      if (link.getAttribute("href") === `#${activeEntry.target.id}`) {
        link.setAttribute("aria-current", "true");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }, {
    rootMargin: "-28% 0px -58%",
    threshold: [0, 0.08, 0.25]
  });
  observedSections.forEach((section) => sectionObserver.observe(section));
}

document.querySelectorAll("[data-year]").forEach((element) => {
  element.textContent = String(new Date().getFullYear());
});
