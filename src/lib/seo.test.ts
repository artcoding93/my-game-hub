// SEO 데이터 검증: 새 게임을 추가하면 `npm run test:seo`로 sitemap·메타데이터 규칙이 지켜지는지 확인한다.
// (빌드 결과물 검증은 scripts/check-seo-build.mjs → `npm run test:seo:build`)
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { games } from "@/data/games";
import { GAME_SLUGS } from "@/data/types";
import { getListedGames, isPlayable } from "@/lib/games";
import { getGameListLastModified, getGameSeo, getHomeDescription, getIndexableGames, getSitemapEntries, PUBLIC_PAGES } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

const PUBLIC_DIR = new URL("../../public/", import.meta.url);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("게임 데이터", () => {
  test("GAME_SLUGS와 games.ts가 1:1로 대응한다", () => {
    assert.deepEqual([...games.map((g) => g.slug)].sort(), [...GAME_SLUGS].sort());
  });

  test("slug·alias는 kebab-case이고 서로 겹치지 않는다", () => {
    const all = games.flatMap((g) => [g.slug, ...(g.aliases ?? [])]);
    for (const value of all) assert.match(value, /^[a-z0-9]+(-[a-z0-9]+)*$/, value);
    assert.equal(new Set(all).size, all.length, "slug와 alias 중복");
  });

  test("날짜는 YYYY-MM-DD이고 updatedAt은 출시일 이후다", () => {
    for (const g of games) {
      assert.match(g.releasedAt, ISO_DATE, g.slug);
      assert.ok(!Number.isNaN(Date.parse(g.releasedAt)), g.slug);
      if (g.updatedAt) {
        assert.match(g.updatedAt, ISO_DATE, g.slug);
        assert.ok(g.updatedAt >= g.releasedAt, `${g.slug}: updatedAt < releasedAt`);
      }
    }
  });

  test("썸네일 파일이 public/에 있다", () => {
    for (const g of games) {
      assert.ok(g.thumbnail.startsWith("/"), g.slug);
      assert.ok(existsSync(fileURLToPath(new URL(g.thumbnail.slice(1), PUBLIC_DIR))), `${g.slug}: ${g.thumbnail} 없음`);
    }
  });
});

describe("게임 페이지 메타데이터", () => {
  const indexable = getIndexableGames();

  test("공개 게임이 1개 이상 있다 (generateStaticParams는 빈 배열이면 빌드 에러)", () => {
    assert.ok(indexable.length > 0);
  });

  test("title·description·canonical이 게임마다 고유하다", () => {
    const seo = indexable.map(getGameSeo);
    for (const key of ["fullTitle", "description", "url"] as const) {
      assert.equal(new Set(seo.map((s) => s[key])).size, seo.length, `${key} 중복`);
    }
  });

  test("canonical은 공식 도메인의 /games/<slug>다", () => {
    for (const g of indexable) assert.equal(getGameSeo(g).url, `${SITE_URL}/games/${g.slug}`);
  });

  test("description은 100~170자의 문장이다 (권장 120~160자)", () => {
    for (const g of indexable) {
      const length = [...g.description].length;
      assert.ok(length >= 100 && length <= 170, `${g.slug}: ${length}자`);
    }
  });

  test("seoTitle에 사이트 이름을 직접 쓰지 않는다 (자동으로 붙는다)", () => {
    for (const g of games) {
      if (g.seoTitle) assert.ok(!/artcoding/i.test(g.seoTitle), `${g.slug}: ${g.seoTitle}`);
    }
  });

  test("홈 description에 최근 게임이 자동으로 들어간다", () => {
    const description = getHomeDescription();
    const newest = [...indexable].sort((a, b) => (a.releasedAt < b.releasedAt ? 1 : -1))[0];
    assert.ok(description.includes(newest.title.split(":")[0].trim()), description);
  });
});

describe("sitemap.xml", () => {
  const entries = getSitemapEntries();
  const urls = entries.map((e) => e.url);

  test("모든 URL이 https://www 공식 도메인이고 중복이 없다", () => {
    for (const url of urls) {
      assert.ok(url === SITE_URL || url.startsWith(`${SITE_URL}/`), url);
      assert.ok(!url.endsWith("/"), `${url}: 끝에 / (canonical과 불일치)`);
      assert.ok(!/[?#]/.test(url), url);
    }
    assert.equal(new Set(urls).size, urls.length, "중복 URL");
  });

  test("공개 게임은 모두 포함되고, 준비 중 게임과 alias 주소는 포함되지 않는다", () => {
    for (const g of games) {
      const url = `${SITE_URL}/games/${g.slug}`;
      assert.equal(urls.includes(url), g.status === "available", url);
      for (const alias of g.aliases ?? []) assert.ok(!urls.includes(`${SITE_URL}/games/${alias}`), alias);
    }
  });

  test("홈과 정보 페이지가 포함된다", () => {
    assert.ok(urls.includes(SITE_URL));
    for (const page of PUBLIC_PAGES) assert.ok(urls.includes(`${SITE_URL}${page.path}`), page.path);
    assert.equal(urls.length, 1 + getIndexableGames().length + PUBLIC_PAGES.length);
  });

  test("홈 lastmod는 가장 최근 게임 날짜를 따른다", () => {
    const home = entries.find((e) => e.url === SITE_URL);
    assert.equal(home?.lastModified, getGameListLastModified());
    for (const e of entries) if (e.lastModified) assert.match(e.lastModified, ISO_DATE, e.url);
  });
});

describe("prototype 게임 (개발 중 비공개)", () => {
  const prototype = { ...games[0], status: "prototype" as const };

  test("목록·sitemap·색인 대상에 prototype 게임이 없다", () => {
    const urls = getSitemapEntries().map((e) => e.url);
    for (const g of games.filter((g) => g.status === "prototype")) {
      assert.ok(!getListedGames().includes(g), g.slug);
      assert.ok(!getIndexableGames().includes(g), g.slug);
      assert.ok(!urls.includes(`${SITE_URL}/games/${g.slug}`), g.slug);
    }
  });

  test("prototype 페이지는 Vercel Production에서만 막힌다 (로컬·Preview에서는 열림)", () => {
    assert.equal(isPlayable(prototype, "production"), false);
    assert.equal(isPlayable(prototype, "preview"), true);
    assert.equal(isPlayable(prototype, undefined), true);
    assert.equal(isPlayable({ ...prototype, status: "available" }, "production"), true);
    assert.equal(isPlayable({ ...prototype, status: "coming-soon" }, "preview"), false);
  });
});
