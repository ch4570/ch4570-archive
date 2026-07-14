(() => {
  const progress = document.querySelector(".scroll-progress");
  const toast = document.querySelector(".toast");

  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 1800);
  };

  document.querySelectorAll("[data-print]").forEach((button) => {
    button.addEventListener("click", () => window.print());
  });

  document.querySelectorAll("[data-copy-email]").forEach((button) => {
    button.addEventListener("click", async () => {
      const email = "ckdekrn88@gmail.com";
      let copied = false;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await Promise.race([
            navigator.clipboard.writeText(email),
            new Promise((_, reject) => {
              window.setTimeout(() => reject(new Error("clipboard timeout")), 600);
            }),
          ]);
          copied = true;
        }
      } catch {
        copied = false;
      }

      if (!copied) {
        const input = document.createElement("textarea");
        input.value = email;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        copied = document.execCommand("copy");
        input.remove();
      }

      showToast(copied ? "이메일 주소를 복사했습니다." : `이메일: ${email}`);
    });
  });

  const details = [...document.querySelectorAll(".case-details")];
  const detailsToggle = document.querySelector("[data-toggle-details]");
  const diagramDetails = [...document.querySelectorAll(".diagram-disclosure")];
  const mobileDiagramQuery = window.matchMedia("(max-width: 900px)");
  let isPrinting = false;

  const syncDiagramDetails = ({ matches }) => {
    if (isPrinting) return;
    diagramDetails.forEach((item) => {
      item.open = !matches;
    });
  };

  syncDiagramDetails(mobileDiagramQuery);
  if (mobileDiagramQuery.addEventListener) {
    mobileDiagramQuery.addEventListener("change", syncDiagramDetails);
  } else {
    mobileDiagramQuery.addListener(syncDiagramDetails);
  }

  if (detailsToggle && details.length) {
    detailsToggle.addEventListener("click", () => {
      const shouldOpen = details.some((item) => !item.open);
      details.forEach((item) => {
        item.open = shouldOpen;
      });
      detailsToggle.textContent = shouldOpen ? "상세 접기" : "상세 펼치기";
      detailsToggle.setAttribute("aria-expanded", String(shouldOpen));
    });
  }

  const printableDetails = [...details, ...diagramDetails];
  let printState = [];
  window.addEventListener("beforeprint", () => {
    isPrinting = true;
    printState = printableDetails.map((item) => item.open);
    printableDetails.forEach((item) => {
      item.open = true;
    });
  });

  window.addEventListener("afterprint", () => {
    printableDetails.forEach((item, index) => {
      item.open = printState[index] ?? false;
    });
    isPrinting = false;
    syncDiagramDetails(mobileDiagramQuery);
  });

  const localLinks = [...document.querySelectorAll(".case-nav a[href^='#']")];
  const sections = localLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        localLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${visible.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-18% 0px -66%", threshold: [0, 0.15, 0.4] },
    );
    sections.forEach((section) => observer.observe(section));
  }

  const updateProgress = () => {
    if (!progress) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progress.style.width = `${value * 100}%`;
  };

  updateProgress();
  window.addEventListener("scroll", updateProgress, { passive: true });
  window.addEventListener("resize", updateProgress);
})();
