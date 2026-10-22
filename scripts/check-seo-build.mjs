// 빌드 결과물 SEO 검증: `npm run build` 뒤에 `npm run test:seo:build`로 실행한다.
// 실제로 생성된 sitemap.xml·robots.txt·프리렌더 HTML을 읽어, sitemap의 모든 URL이
// 존재하고 색인 가능하며(canonical = 자기 자신, robots index) 홈에서 실제 <a href> 링크로 연결되는지 확인한다.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const SITE_URL = "https://www.artcoding-game.app";
const APP = new URL("../.next/server/app/", import.meta.url);

const read = (path) => readFileSync(new URL(path, APP), "utf8");
const pick = (html, re) => html.match(re)?.[1] ?? null;
const decode = (text) => text?.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** sitemap URL → 프리렌더된 HTML 파일 경로 */
function htmlFileFor(url) {
  const path = url.slice(SITE_URL.length);
  return path === "" ? "index.html" : `${path.slice(1)}.html`;
}

if (!existsSync(new URL("sitemap.xml.body", APP))) {
  console.error("빌드 결과물이 없습니다. 먼저 `npm run build`를 실행하세요.");
  process.exit(1);
}

const sitemap = read("sitemap.xml.body");
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pages = locs.map((url) => {
  const html = read(htmlFileFor(url));
  return {
    url,
    html,
    title: decode(pick(html, /<title>([^<]*)<\/title>/)),
    description: decode(pick(html, /<meta name="description" content="([^"]*)"/)),
    canonical: pick(html, /<link rel="canonical" href="([^"]*)"/),
    robots: pick(html, /<meta name="robots" content="([^"]*)"/),
    ogUrl: pick(html, /<meta property="og:url" content="([^"]*)"/),
  };
});

test("robots.txt가 전체 크롤링을 허용하고 sitemap 주소를 선언한다", () => {
  const robots = read("robots.txt.body");
  assert.match(robots, /^User-Agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.doesNotMatch(robots, /^Disallow: \/\s*$/m);
  assert.match(robots, new RegExp(`^Sitemap: ${SITE_URL}/sitemap\\.xml$`, "m"));
});

test("sitemap의 URL은 모두 공식 도메인이며 중복이 없다", () => {
  assert.ok(locs.length > 0);
  for (const url of locs) assert.ok(url === SITE_URL || url.startsWith(`${SITE_URL}/`), url);
  assert.equal(new Set(locs).size, locs.length);
});

test("sitemap의 모든 페이지가 실제로 존재하고 색인 가능하다", () => {
  for (const page of pages) {
    assert.equal(page.canonical, page.url, `${page.url}: canonical 불일치`);
    assert.equal(page.ogUrl, page.url, `${page.url}: og:url 불일치`);
    assert.equal(page.robots, "index, follow", `${page.url}: robots=${page.robots}`);
    assert.match(page.html, /<html lang="ko"/, page.url);
    assert.equal((page.html.match(/<h1[\s>]/g) ?? []).length, 1, `${page.url}: h1 개수`);
  }
});

test("페이지마다 title·description이 있고 서로 다르다", () => {
  for (const page of pages) {
    assert.ok(page.title, `${page.url}: title 없음`);
    assert.ok(page.description, `${page.url}: description 없음`);
  }
  assert.equal(new Set(pages.map((p) => p.title)).size, pages.length, "title 중복");
  assert.equal(new Set(pages.map((p) => p.description)).size, pages.length, "description 중복");
});

test("홈 HTML에 모든 게임 페이지로 가는 <a href> 링크가 있다", () => {
  const home = read("index.html");
  const gameUrls = locs.filter((url) => url.startsWith(`${SITE_URL}/games/`));
  assert.ok(gameUrls.length > 0);
  for (const url of gameUrls) {
    const path = url.slice(SITE_URL.length);
    assert.ok(home.includes(`href="${path}"`), `홈에 ${path} 링크 없음`);
  }
});

test("빌드된 게임 페이지는 모두 sitemap에 있다 (누락 없음)", () => {
  const built = readdirSync(new URL("games/", APP))
    .filter((name) => name.endsWith(".html") && !name.startsWith("["))
    .map((name) => `${SITE_URL}/games/${name.replace(/\.html$/, "")}`);
  for (const url of built) assert.ok(locs.includes(url), `sitemap 누락: ${url}`);
});
