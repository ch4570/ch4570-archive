import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanEditableRegions } from "../admin/editor-core.js";
import { AXES, CARDS, KEYWORDS } from "../assets/home-data.js";
import { applyRegions } from "./build-home.mjs";
import { miniSvg } from "./home-render.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(resolve(root, file), "utf8");
const plain = (html) => html.replace(/<[^>]+>/gu, " ").replaceAll("&amp;", "&").replace(/\s+/gu, " ").trim();
const tokens = (text) => text.match(/[가-힣]+|[A-Za-z0-9_#]+(?:[.-][A-Za-z0-9_#]+)*/gu) ?? [];

test("index.html의 생성 구역이 assets/home-data.js와 같다", async () => {
  const source = await read("index.html");
  assert.equal(applyRegions(source), source, "`npm run build:home`으로 구역을 다시 쓰세요");
});

test("키워드, 카드, 분야 칩이 서로 맞물린다", () => {
  assert.equal(KEYWORDS.length, 5);
  const axisIds = new Set(AXES.map((axis) => axis.id));
  for (const keyword of KEYWORDS) {
    const card = CARDS.find((c) => c.id === keyword.card);
    assert.ok(card, `${keyword.id}의 카드 ${keyword.card}가 없다`);
    assert.equal(card.kw, keyword.id, `${card.id} 카드가 ${keyword.id} 키워드를 가리켜야 한다`);
    assert.ok(card.axes.includes(keyword.axis), `${card.id} 카드의 분야에 ${keyword.axis}가 있어야 한다`);
    assert.ok(axisIds.has(keyword.axis));
    assert.ok(keyword.strip.length >= 3, `${keyword.id} 흐름 띠가 비었다`);
  }
  for (const card of CARDS) for (const axis of card.axes) assert.ok(axisIds.has(axis), `${card.id}: 모르는 분야 ${axis}`);
});

test("프로젝트 순서와 카드 제목은 그대로다", () => {
  assert.deepEqual(CARDS.map((c) => c.id), ["jpa", "boot", "event", "batch", "search", "test", "gateway", "oss"]);
  assert.deepEqual(CARDS.slice(0, 7).map((c) => c.title), [
    "JPA 변경 감지 오류 재현과 데이터 보정",
    "Drive-Service Spring Boot 3 전환",
    "Kafka 이벤트 실패 복구",
    "배치 재시작과 포인트 정합성 검증",
    "개인화 피드 검색 소스 실패 격리",
    "테스트 공통 모듈과 CI 메모리 부족 해소",
    "Gateway 인증·인가와 검색 API",
  ]);
});

test("상세 창이 쓰는 흐름 키는 flow.js의 FLOWS에 있다", async () => {
  const flowSource = await read("assets/flow.js");
  const flowKeys = new Set([...flowSource.matchAll(/^ {2}(\w+): \{$/gmu)].map((m) => m[1]));
  for (const card of CARDS.filter((c) => c.detail?.flow)) {
    assert.ok(flowKeys.has(card.detail.flow), `FLOWS에 ${card.detail.flow}가 없다`);
    assert.ok(card.detail.steps?.length, `${card.id}: 정적 단계 목록이 있어야 한다`);
  }
});

test("지도와 미니 도식의 문구는 카드·흐름도에 이미 있는 말만 쓴다", async () => {
  const flowSource = await read("assets/flow.js");
  const corpus = new Set(tokens([
    flowSource,
    ...CARDS.flatMap((c) => [c.title, c.result ?? "", c.tech ?? "", c.summary ?? "", ...(c.detail?.rows ?? []).flat(), ...(c.detail?.steps ?? []), c.detail?.links ?? ""]),
    ...KEYWORDS.map((k) => k.desc),
  ].map(plain).join(" ")));
  // 한국어는 조사·어미가 붙으므로, 앞 두 글자(두 글자 낱말은 그대로)가 말뭉치 낱말의 앞부분과 같으면 같은 말로 본다.
  // 아래는 오너가 승인한 시안에서 원문을 가볍게 바꿔 쓴 말이다. 사실은 바뀌지 않았고, 늘리지 않는다.
  const PARAPHRASES = new Set(["멈추면", "만든", "만듦", "수는", "개에서", "읽어"]);
  const names = CARDS.flatMap((c) => [c.org ?? "", c.period ?? ""]).join(" ");
  const corpusWords = [...new Set([...corpus, ...tokens(names)])];
  const known = (word) => PARAPHRASES.has(word) || corpusWords.some((c) => c === word || c.startsWith(word.length > 2 ? word.slice(0, 2) : word));
  const phrases = [];
  for (const k of KEYWORDS) {
    phrases.push(plain(k.caption), k.shell.out, ...k.strip.flatMap((s) => [s.a, s.b]));
  }
  for (const card of CARDS.filter((c) => c.mini)) {
    phrases.push(card.mini.title, ...Object.values(card.mini.nodes).map((n) => n.label.replaceAll("|", " ")), ...(card.mini.lanes ?? []).map(([t]) => t), ...(card.mini.bars ?? []).flatMap((b) => [b.text, b.value ?? ""]));
  }
  const unknown = [...new Set(phrases.flatMap(tokens))].filter((word) => word.length > 1 && !known(word));
  assert.deepEqual(unknown, [], "원문에 없는 낱말: " + unknown.join(", "));
});

test("미니 도식은 모두 SVG로 그려지고 제목이 붙는다", () => {
  for (const card of CARDS.filter((c) => c.mini)) {
    const svg = miniSvg(card);
    assert.match(svg, new RegExp(`aria-labelledby="mt-${card.id}"`));
    assert.match(svg, /<title id="mt-/);
    assert.equal(svg.match(/<svg/gu).length, 1);
    assert.equal((svg.match(/<g class="n /gu) ?? []).length, Object.keys(card.mini.nodes).length);
  }
});

test("홈의 편집 가능한 필드 24개가 그대로 있다", async () => {
  const source = await read("index.html");
  const regions = scanEditableRegions(source);
  assert.deepEqual(regions.map((r) => r.id).sort(), [
    "home-003", "home-004", "home-006", "home-007", "home-009", "home-011", "home-014", "home-016", "home-017", "home-018",
    "home-019", "home-020", "home-021", "home-022", "home-023", "home-024", "home-025", "home-026", "home-027", "home-028",
    "home-029", "home-030", "home-031", "home-032",
  ].sort());
});

test("홈 문구에 연수 표현과 보고서 말투를 다시 들이지 않는다", async () => {
  const text = plain((await read("index.html")).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gu, " "));
  const data = plain(JSON.stringify([KEYWORDS, CARDS]));
  for (const bad of [/몇 년/u, /\d+년째/u, /\d+년차/u, /약 \d+년간/u, /증거/u, /진단/u, /도식/u]) {
    assert.doesNotMatch(text, bad, `index.html: ${bad}`);
    assert.doesNotMatch(data, bad, `home-data.js: ${bad}`);
  }
});

test("홈은 three.js를 쓰지 않는다", async () => {
  const source = await read("index.html");
  assert.doesNotMatch(source, /three|importmap|event-stream/iu);
  assert.doesNotMatch(await read("assets/home.js"), /three|event-stream/iu);
});
