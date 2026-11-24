/*
 * 이력서 화면 전용: 본문에서 단어를 찾아 칠하는 grep 줄.
 * 문서 구조는 건드리지 않고 CSS Custom Highlight(::highlight(grep))로만 칠한다.
 * 이 스크립트가 없거나 브라우저가 Highlight를 지원하지 않으면 grep 줄이 나타나지 않거나 지워지고
 * 본문은 그대로 읽힌다. PDF 내보내기에서는 이 스크립트를 싣지 않는다.
 */
(() => {
  document.documentElement.classList.add("js");
  const box = document.querySelector(".grep-line");
  const input = document.getElementById("grep-q");
  const out = document.getElementById("grep-n");
  const root = document.querySelector("[data-grep-root]");
  if (!box || !input || !out || !root) return;
  if (!(window.CSS && CSS.highlights && window.Highlight)) {
    box.remove();
    return;
  }

  const skip = ".resume-tools, .cmd, [aria-hidden=true]";
  // 화면이 좁아져 grep 줄이 숨으면 칠해 둔 강조도 지운다.
  matchMedia("(max-width: 760px)").addEventListener("change", (event) => {
    if (event.matches) {
      CSS.highlights.delete("grep");
      input.value = "";
      out.textContent = "";
    }
  });
  const run = () => {
    const query = input.value.trim().toLowerCase();
    CSS.highlights.delete("grep");
    if (!query) {
      out.textContent = "";
      return;
    }
    const ranges = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement.closest(skip) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    for (let node; (node = walker.nextNode()); ) {
      const text = node.data.toLowerCase();
      let index = 0;
      while ((index = text.indexOf(query, index)) !== -1) {
        const range = new Range();
        range.setStart(node, index);
        range.setEnd(node, index + query.length);
        ranges.push(range);
        index += query.length;
      }
    }
    if (ranges.length) CSS.highlights.set("grep", new Highlight(...ranges));
    out.textContent = `${ranges.length} matches`;
  };

  input.addEventListener("input", run);

  // '기술' 줄의 단어를 누르면 그 단어로 찾는다(쉼표 사이를 한 단어로 본다).
  document
    .querySelectorAll("[aria-labelledby=skills-title] .resume-skills dd")
    .forEach((dd) =>
      dd.addEventListener("click", (event) => {
        if (getComputedStyle(box).display === "none") return; // 좁은 화면에서는 grep 줄이 없으니 칠하지 않는다
        const position = document.caretPositionFromPoint
          ? document.caretPositionFromPoint(event.clientX, event.clientY)
          : null;
        const node = position ? position.offsetNode : null;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        const text = node.data;
        const offset = position.offset;
        const start = text.lastIndexOf(",", offset - 1) + 1;
        let end = text.indexOf(",", offset);
        if (end === -1) end = text.length;
        input.value = text.slice(start, end).trim();
        run();
        input.focus();
      }),
    );
})();
