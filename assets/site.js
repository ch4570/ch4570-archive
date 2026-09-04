(() => {
  document.body.classList.add("has-reveal");

  const progress = document.querySelector(".scroll-progress");
  const toast = document.querySelector(".toast");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const terminalHero = document.querySelector(".terminal-home .terminal-hero");
  if (terminalHero && !reduceMotion) {
    const terminalColumns = [
      [
        "$ ./gradlew test --parallel",
        "> Task :compileKotlin UP-TO-DATE",
        "> Task :integrationTest PASSED",
        "BUILD SUCCESSFUL in 4.2s",
        "42 actionable tasks: 18 executed",
      ],
      [
        "[INFO] consumer=feed-recovery partition=03",
        "[TRACE] offset=814230 lag=0",
        "[OK] payload archived status=RETRYABLE",
        "[RUN] replay --scope=failed-only",
        "[DONE] downstream=3 latency=42ms",
      ],
      [
        "$ psql archive --command status.sql",
        "SELECT id, status FROM event_archive;",
        "UPDATE 128",
        "COMMIT",
        "consistency_check: matched=13/13",
      ],
      [
        "$ docker compose up -d",
        "kafka-1      healthy",
        "postgres-1   healthy",
        "redis-1      healthy",
        "opensearch-1 healthy",
      ],
      [
        "$ git switch feature/recovery-path",
        "Switched to a new branch",
        "$ git diff --stat",
        "recovery.kt  +84 -12",
        "$ git commit -m 'isolate failed work'",
      ],
      [
        "[CACHE] key=feed:user:4570 miss",
        "[SEARCH] sources=9 timeout=120ms",
        "[RANK] candidates=320 deduped=187",
        "[FALLBACK] redis=unavailable recompute=true",
        "[OK] response status=200",
      ],
      [
        "$ kubectl get pods -n production",
        "api-7d9f6c5b6d-k4m2p   1/1 Running",
        "worker-56f87c4ff8-r9x1q 1/1 Running",
        "batch-28914320-xc7vt    0/1 Completed",
        "rollout status: successfully rolled out",
      ],
      [
        "[BATCH] job=archive-transfer restart=true",
        "[READ] cursor=tenant:82:page:14",
        "[WRITE] tables=10 chunk=500",
        "[CHECK] ledger balance=consistent",
        "[DONE] exit_code=COMPLETED",
      ],
    ];

    const stream = document.createElement("div");
    stream.className = "terminal-rain";
    stream.setAttribute("aria-hidden", "true");

    for (let sheetIndex = 0; sheetIndex < 2; sheetIndex += 1) {
      const sheet = document.createElement("div");
      sheet.className = `terminal-rain__sheet terminal-rain__sheet--${sheetIndex + 1}`;

      for (let columnIndex = 0; columnIndex < 4; columnIndex += 1) {
        const column = document.createElement("div");
        column.className = "terminal-rain__column";
        const lines = terminalColumns[sheetIndex * 4 + columnIndex];

        lines.forEach((line) => {
          const item = document.createElement("span");
          item.className = "terminal-rain__line";
          item.textContent = line;
          column.appendChild(item);
        });
        sheet.appendChild(column);
      }
      stream.appendChild(sheet);
    }
    terminalHero.prepend(stream);
  }

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

  const printableDetails = diagramDetails;
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

  document.querySelectorAll("[data-current-year]").forEach((item) => {
    item.textContent = String(new Date().getFullYear());
  });

  const revealItems = [...document.querySelectorAll("[data-reveal]")];
  if (!reduceMotion && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    revealItems.forEach((item) => revealObserver.observe(item));
  } else {
    revealItems.forEach((item) => item.classList.add("is-revealed"));
  }

  const sectionLinks = [...document.querySelectorAll("[data-section-link]")];
  const linkedSections = sectionLinks
    .map((link) => document.querySelector(link.getAttribute("href")))
    .filter(Boolean);

  if ("IntersectionObserver" in window && linkedSections.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (!activeEntry) return;
        sectionLinks.forEach((link) => {
          const active = link.getAttribute("href") === `#${activeEntry.target.id}`;
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      },
      { rootMargin: "-25% 0px -60%", threshold: [0, 0.12, 0.35] },
    );
    linkedSections.forEach((section) => sectionObserver.observe(section));
  }

  let progressFrame = 0;
  const updateProgress = () => {
    progressFrame = 0;
    if (!progress) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const value = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progress.style.width = `${value * 100}%`;
  };

  const requestProgressUpdate = () => {
    if (progressFrame) return;
    progressFrame = window.requestAnimationFrame(updateProgress);
  };

  updateProgress();
  window.addEventListener("scroll", requestProgressUpdate, { passive: true });
  window.addEventListener("resize", requestProgressUpdate);
})();
