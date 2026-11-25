import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { VIZ, render } from "./viz.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const documents = ["resume", "career", "portfolio"];
const figurePattern = /<div class="viz[^"]*" data-viz="([^"]+)" data-src="[^"]+"><svg[\s\S]*?<\/svg><\/div>/gu;

const bodyText = (html) =>
  html
    .replace(/<head>[\s\S]*?<\/head>/u, "")
    .replace(/<svg[\s\S]*?<\/svg>/gu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replaceAll("&nbsp;", " ")
    .replace(/\s+/gu, " ");

test("every diagram in the documents is exactly what scripts/viz.mjs renders", async () => {
  for (const name of documents) {
    const html = await readFile(resolve(root, name, "index.html"), "utf8");
    const figures = [...html.matchAll(figurePattern)];
    assert.ok(figures.length > 0, name);
    for (const [markup, id] of figures) {
      assert.ok(VIZ[id], name + " uses an unknown diagram " + id);
      assert.equal(markup, render(id), name + " diagram " + id + " differs from the module output (edit scripts/viz.mjs, then rewrite the markup)");
    }
  }
});

test("each diagram's numbers also appear as text in the same document", async () => {
  for (const name of documents) {
    const html = await readFile(resolve(root, name, "index.html"), "utf8");
    const text = bodyText(html);
    for (const [, id] of html.matchAll(figurePattern)) {
      for (const fact of VIZ[id].facts) {
        assert.ok(text.includes(fact), name + ": diagram " + id + " draws " + fact + " but the text does not state it");
      }
    }
  }
});

test("diagram values come only from the Rallit profile or repository records", () => {
  // 값이 둘뿐인 전후 비교는 막대 둘이다. 추세선(polyline·path로 이은 점열)이나 중간값은 만들지 않는다.
  for (const id of Object.keys(VIZ)) {
    const markup = render(id);
    assert.doesNotMatch(markup, /<polyline\b/u, id);
  }
  const rds = render("rds-cpu");
  assert.equal(rds.match(/<rect /gu)?.length, 2);
  assert.match(rds, /width="122.8"/u);
  assert.match(rds, /width="3.7"/u);
  assert.match(render("feed-funnel"), /width="24\.8"/u);
  assert.match(render("feed-funnel"), /width="5"/u);
});
