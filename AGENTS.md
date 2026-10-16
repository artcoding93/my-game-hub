<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# My Game Hub

여러 개의 2D 브라우저 미니게임을 제공하는 웹사이트. Google AdSense 수익화를 전제로 설계한다.

## 기술 스택

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict)
- Tailwind CSS v4 (`src/app/globals.css`의 `@import "tailwindcss"`)
- Phaser 3.90.0 (Gold Escape·Star Vanguard 렌더링 전용, 정확한 버전 고정). Snake는 Canvas 2D를 직접 사용한다.
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true` — 변경하지 않는다.

## 명령어

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버 (AdSlot 자리 표시 박스가 보임) |
| `npm run build` | 프로덕션 빌드 + 타입 검사 |
| `npm run lint` | ESLint |

작업을 마치기 전에 `npm run lint`와 `npm run build`가 모두 통과해야 한다.

## 폴더 구조

```
src/
  app/
    layout.tsx               # 전역 레이아웃, 기본 메타데이터(title 템플릿, metadataBase)
    page.tsx                 # 메인: 사이트 소개 + 게임 목록 + 특징
    games/[slug]/page.tsx    # 개별 게임 페이지 (generateStaticParams + generateMetadata)
    about/ contact/ privacy/ terms/   # 사이트 정보·정책 페이지 (ContentPage 사용)
    not-found.tsx
    sitemap.ts, robots.ts    # 게임 데이터 + 정적 페이지 목록으로 자동 생성
  components/                # 공통 UI (AdSlot, GameCard, GamePageLayout, ContentPage, TodoMark, SiteHeader/Footer)
  data/
    types.ts                 # GAME_SLUGS, GameMeta 등 타입
    games.ts                 # 게임 목록·메타데이터 (단일 진실 공급원)
  games/
    registry.tsx             # slug → 게임 컴포넌트 매핑 (Client 모듈, next/dynamic)
    <slug>/                  # 게임별 로직과 컴포넌트
      index.ts               # default export = 게임 루트 컴포넌트
      <Name>Game.tsx         # "use client" 루트 컴포넌트
      logic.ts               # 순수 함수 게임 로직 (React/DOM 의존 금지)
      use<Name>Game.ts       # 게임 루프·입력·저장 등 부수 효과 훅
      renderer.ts            # 캔버스 그리기
      constants.ts, types.ts
    gold-escape/             # Phaser 기반 게임 (구조는 아래 "Gold Escape" 참고)
      config.ts              # 속도·시간·점수·회차 배율 등 모든 밸런스 값
      stages.ts              # 스테이지 맵 문자열 (범례는 logic/level.ts)
      logic/                 # 순수 TS 규칙: level, terrain(이동 규칙), pathfinding(BFS), simulation
      controller.ts          # 고정 스텝(1/60초) 진행 + HUD 구독 (Phaser 비의존)
      input.ts               # 키보드·터치 공용 입력 상태
      render/                # Phaser 장면, 픽셀아트(sprites.ts), createPhaserGame.ts
      GoldEscapeGame.tsx     # React: Phaser 마운트, HUD, 오버레이, 터치 버튼
    star-vanguard/           # Phaser 기반 우주 슈팅 (Gold Escape와 같은 구조, 아래 "Star Vanguard" 참고)
      config.ts              # 속도·탄 상한·웨이브 난이도(difficulty)·보스·파워업 등 모든 밸런스 값
      logic/                 # 순수 TS 규칙: rng(시드 난수), paths(베지어 경로), waves(편대 구성), simulation
      controller.ts, input.ts, sound.ts(Web Audio 합성 효과음), render/, StarVanguardGame.tsx
  lib/
    games.ts                 # 게임 조회 헬퍼 (getAllGames, getGameBySlug, getGamePath ...)
    site.ts                  # siteConfig, operatorConfig(운영자·정책 정보), navLinks/policyLinks, adsConfig
    storage.ts               # localStorage 안전 래퍼
    fonts.ts                 # 공용 픽셀 폰트(arcadeFont)
public/games/<slug>/         # 게임별 썸네일(thumbnail.svg 등), sounds/
```

## 새 게임 추가 절차

1. `src/data/types.ts`의 `GAME_SLUGS`에 slug(kebab-case) 추가
2. `src/data/games.ts`에 메타데이터 추가 — `about`(소개 문단), `rules`(규칙), `controls`, 선택 `tips` 포함.
   (`status: "coming-soon"`이면 목록에만 노출되고 페이지는 404)
3. `src/games/<slug>/` 생성 후 `index.ts`에서 루트 컴포넌트를 default export
4. `src/games/registry.tsx`에 `dynamic(() => import("./<slug>"), { ssr: false, loading: GameLoading })` 등록
5. `public/games/<slug>/thumbnail.*` 추가
6. 게임이 브라우저 저장소·쿠키·외부 서비스를 새로 쓰면 `src/app/privacy/page.tsx`를 함께 개정
7. 라우트·메타데이터·sitemap은 자동 반영된다. 1번 이후 2·4번이 빠지면 타입 에러가 난다.

## 개발 규칙

### 라우팅 / Next.js
- 게임 페이지는 `src/app/games/[slug]/` 하나로 처리한다. 게임별 라우트 폴더를 따로 만들지 않는다.
- Cache Components 환경이므로 `dynamicParams`는 사용할 수 없다. 알 수 없는 slug는 페이지에서 `notFound()`로 처리한다.
  (스트리밍 이후 호출되므로 HTTP 200 + `noindex`로 응답된다. Next.js가 문서화한 동작이다.)
- `generateStaticParams`는 최소 1개 이상의 값을 반환해야 한다. 빈 배열이면 빌드 에러가 난다.
- Server Component에서 `next/dynamic`을 쓰면 코드 분할이 되지 않는다. 게임 컴포넌트 lazy loading은 `registry.tsx`(Client 모듈)에서만 한다.
- `params`는 Promise다. `PageProps<"/games/[slug]">` 타입 헬퍼를 사용한다.
- `partialPrefetching`이 켜져 있으므로 `params`는 페이지 최상단에서 await하지 않는다. URL과 무관한 껍데기(레이아웃·광고 자리)는
  밖에 두고, params를 읽는 컴포넌트만 `<Suspense>` 안에 넣는다(`games/[slug]/page.tsx`의 `GameContent` 참고).
  위반 시 `next dev`에서 "encountered URL data" 에러가 뜬다. `next dev`로 페이지를 열어 콘솔을 확인한다.
- 렌더링 중 `new Date()`, `Math.random()`을 쓰지 않는다(Cache Components 프리렌더 에러). 연도 등은 `siteConfig`의 고정값을 쓴다.

### 게임 구현
- 게임 루트 컴포넌트만 `"use client"`로 둔다. 페이지와 레이아웃은 Server Component로 유지한다.
- 게임 상태 전이는 `logic.ts`의 순수 함수로 작성한다. 렌더링(`renderer.ts`)과 입력 처리는 분리한다.
- 캔버스는 고정 내부 해상도 × `devicePixelRatio`로 그리고, 화면 크기는 CSS(`w-full aspect-*`)로 맞춘다.
- 모바일: 캔버스에 `touch-none`을 적용해 스와이프 중 스크롤을 막는다. 터치 버튼은 최소 44px 높이로 만든다.
- 키보드 입력 시 방향키·Space의 기본 스크롤 동작을 `preventDefault`로 막는다.

### Gold Escape (Phaser)
- `phaser`는 `render/` 안에서만 import한다. `render/createPhaserGame`은 `GoldEscapeGame.tsx`의 `useEffect`에서
  동적 `import()`로만 불러온다 (Phaser는 `window`를 참조하므로 서버에서 평가되면 안 된다). 레지스트리도 `ssr: false`.
- 게임 규칙은 `logic/`에만 둔다. Phaser 장면은 `GameState`를 읽어 그리기만 하고 상태를 바꾸지 않는다.
- 이동 가능 여부는 `logic/terrain.ts`의 `legalMoves` 하나로 판단한다. 플레이어 이동, 경비원 이동, BFS 간선이 모두 이 함수를 쓰므로
  규칙을 바꿀 때 한 곳만 고친다. 경비원 경로 계획(`planningView`)은 구멍을 벽돌로 본다(구멍을 피하지 않고 빠지게 하기 위함).
- 밸런스 값은 `config.ts`에서만 바꾼다. 점수 지급은 상태 전이(갇힘·소멸·획득) 시점에 한 번만 일어나도록 유지한다.
- 스테이지를 수정하면 모든 금괴·출구 도달 가능 여부를 다시 검증한다(땅파기로 뚫고 내려가는 이동 포함).
- 시뮬레이션은 결정적이다(난수 없음). 로직 변경 시 Node에서 `logic/simulation.ts`를 컴파일해 규칙 테스트를 돌릴 수 있다.

### Star Vanguard (Phaser)
- Gold Escape와 같은 규칙을 따른다: `phaser`는 `render/` 안에서만 import, `createPhaserGame`은 `useEffect`의 동적 `import()`로만 로드,
  규칙은 `logic/`에만 두고 장면은 `GameState`를 읽어 그리기만 한다. 밸런스 값은 `config.ts`에서만 바꾼다.
- 시뮬레이션의 난수는 `logic/rng.ts`(시드 저장: `GameState.rng`)만 쓴다. `Math.random()`은 별 배경·폭발 파편·잡음 버퍼 같은 연출에만 쓴다.
- 적은 hp가 0이 되는 순간 `killEnemy`에서 한 번만 점수를 지급하고 목록에서 빠진다. 웨이브는 `enemies`가 비었을 때만 끝난다
  (급강하로 화면 밖에 나간 적도 목록에 남으므로 웨이브가 멈추거나 일찍 끝나지 않는다).
- 피할 수 없는 탄막 방지: 탄 수 상한(`difficulty().bulletCap`, 보스 `extraBulletCap`), `noFireBelowY`, `maxAimAngleDeg`, 부채꼴 간격을 유지한다.
- 저작권: 그래픽은 `render/sprites.ts`의 자체 픽셀아트, 소리는 `sound.ts`의 실시간 합성만 쓴다. 기존 상용 게임의 이름·캐릭터·편대/진입 패턴·음원을
  가져오지 않는다. 외부 에셋을 추가하면 상업적 이용 가능 여부와 출처·라이선스를 기록한다.

### 광고 (AdSense)
- 광고는 반드시 `src/components/AdSlot.tsx`를 통해서만 넣는다. 실제 스크립트는 아직 연결하지 않았다.
- 게임 페이지 광고 위치는 `GamePageLayout`이 정한다(본문 아래 banner, 데스크톱 sidebar). 게임 화면 바로 위·아래에는 광고를 두지 않고,
  세로 방향으로는 항상 소개·조작·규칙 본문이 게임과 광고 사이에 오게 한다. 사이드바는 게임 열과 48px 이상 떨어뜨린다.
  **게임 조작 영역(`게임 플레이 영역` section) 안이나 조작 버튼 바로 옆에 광고를 넣지 않는다.** 오클릭을 유도하는 배치는 AdSense 정책 위반이다.
- AdSlot은 variant별 최소 높이를 확보해 CLS를 막는다. 새 위치는 기존 variant(banner/rectangle/sidebar)를 재사용한다.
- `NEXT_PUBLIC_ADSENSE_CLIENT`가 없으면 프로덕션에서는 아무것도 렌더링하지 않고, 개발 환경에서는 자리 표시 박스를 렌더링한다.

### SEO
- 게임별 title/description/keywords/OG는 `src/data/games.ts` 값으로 `generateMetadata`에서 생성한다. 페이지에 직접 하드코딩하지 않는다.
- `description`은 120~160자 내외의 자연스러운 한국어 문장으로 쓴다.
- 공식 도메인은 `https://www.artcoding-game.app` (`src/lib/site.ts`의 `SITE_URL`). canonical·OG·JSON-LD·sitemap·robots가 모두 이 값을 쓴다.
  절대 URL은 `absoluteUrl(path)`로 만들고, www 없는 주소나 다른 도메인을 하드코딩하지 않는다.
- 새 공개 페이지를 만들면 `src/app/sitemap.ts`의 `PUBLIC_PAGES`에 추가한다(게임 페이지는 `games.ts`에서 자동 반영).
- 공개 페이지 metadata에는 `robots: INDEXABLE`(index, follow)과 `alternates.canonical`을 함께 넣는다. 루트 layout에는 robots를 두지 않는다
  (404 페이지에 상속되면 Next.js가 자동으로 넣는 noindex와 충돌한다).
- 없는 주소는 404 + noindex가 된다. 외부에 알려진 예전·짧은 게임 주소는 `games.ts`의 `aliases`에 등록하면 308 리디렉션된다(`next.config.ts`).

### 정책 페이지 / 운영자 정보
- 운영자 이름·이메일·시행일 등은 `src/lib/site.ts`의 `operatorConfig`에서만 관리한다. `null`이면 `<TodoMark>`가 "[확인 필요]"로 표시하고, 값을 채우면 자동으로 사라진다.
- 코드로 값을 넣을 수 없는 확인 사항(로그 보존 기간, 배포 리전 등)은 `<TodoMark label="..."/>`와 `{/* TODO: ... */}` 주석으로 표시한다. `grep -rn "TODO" src`로 전체 목록을 볼 수 있다.
- 개인정보처리방침에는 **실제로 사용 중인 서비스만** 적는다. 현재: Vercel 호스팅 로그, Vercel Web Analytics(쿠키 없음, `layout.tsx`의 `<Analytics />`), 이메일 문의, localStorage(최고 점수, Star Vanguard 사운드 설정). 쿠키·광고·Google Analytics는 없음.
- AdSense나 분석 도구를 연결하는 변경에는 반드시 개인정보처리방침 개정(쿠키, 맞춤 광고 해제 방법, 위탁·국외 이전 표)을 포함한다. 방침 파일 상단 주석의 체크리스트를 따른다.
- 연락처 이메일을 코드에 하드코딩하지 않는다(`operatorConfig.email` 사용).

### 코드 스타일
- import 경로는 `@/` alias를 사용한다 (`@/components/...`, `@/lib/...`).
- 스타일은 Tailwind 유틸리티 클래스로 작성하고, 라이트/다크 모드(`dark:`)를 함께 고려한다.
- UI 문구는 한국어, 코드 식별자는 영어로 쓴다.
