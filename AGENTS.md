<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# artcoding game

여러 개의 2D 브라우저 미니게임을 제공하는 웹사이트(공식 이름 "artcoding game", 보조 표기 "artcoding"). Google AdSense 수익화를 전제로 설계한다.

## 기술 스택

- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict)
- Tailwind CSS v4 (`src/app/globals.css`의 `@import "tailwindcss"`)
- Phaser 3.90.0 (Gold Escape·Star Vanguard·Lost Relic 렌더링 전용, 정확한 버전 고정). Snake·Winter Blocks·Cannon Rivals·Turbo Kart·Frosty Roll·Bubble Pop Adventure는 Canvas 2D를 직접 사용한다.
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true` — 변경하지 않는다.

## 명령어

| 명령 | 용도 |
| --- | --- |
| `npm run dev` | 개발 서버 (AdSlot 자리 표시 박스가 보임) |
| `npm run build` | 프로덕션 빌드 + 타입 검사 |
| `npm run lint` | ESLint |
| `npm run test:snake-classic` | Snake Classic 방향 입력 테스트 (반대 방향 금지·빠른 연속 입력·예약 상한·재시작/일시정지 초기화) |
| `npm run test:audio` | 공용 오디오 깨우기 테스트 (사용자 입력 시 resume·무음 버퍼, 막힘 감지, 의도적 정지, Audio Session) |
| `npm run test:winter-blocks` | Winter Blocks 자동화 테스트 (규칙·혹·난이도·방해 요소·BGM 재생기) |
| `npm run test:seo` | SEO 데이터 테스트 (sitemap 항목·title/description/canonical 고유성·썸네일 존재·alias 충돌) |
| `npm run test:seo:build` | 빌드 결과물 검증 (`npm run build` 후 실행: sitemap.xml·robots.txt·프리렌더 HTML의 canonical·robots·홈 링크) |
| `npm run test:cannon-rivals` | Cannon Rivals 자동화 테스트 (물리·지형·규칙·AI 명중률 시뮬레이션·코인 저장·BGM). `CANNON_SIM=full`이면 300회 측정 + 자동 대전 전투 길이 |
| `npm run test:turbo-kart` | Turbo Kart 자동화 테스트 (차량 물리·트랙 검증·랩/순위·아이템·기록·BGM, AI 4대 완주 시뮬레이션 9개 조합). `TURBO_SIM=full`이면 조합마다 5회 |
| `npm run test:frosty-roll` | Frosty Roll 자동화 테스트 (눈 누적·연쇄·낙하·동시 굴림·탈출·보스·아이템 제한·적 안정성, 실제 점프 물리 도달 가능성, 자동 플레이로 5스테이지 클리어, 사운드) |
| `npm run test:bubble-pop-adventure` | Bubble Pop Adventure 자동화 테스트 (방울 발사·포획·상승·천장 모임·바람, 연쇄 터짐·콤보, 방울 밟기, 아이템·Time Freeze, 보스, 적 안정성, 실제 점프 물리로 발판·적·모이는 지점 도달, 자동 플레이로 5스테이지 클리어, 사운드) |
| `npm run test:lost-relic` | Lost Relic 자동화 테스트 (Node 내장 테스트 러너, `scripts/ts-test-hooks.mjs`로 TS 직접 실행) |

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
      sound.ts, soundEvents.ts  # (Snake) Web Audio 합성 효과음 엔진, 상태 변화 → 효과음 선택(순수 함수)
      music.ts               # (Snake) BGM: 16마디 칩튠 루프, look-ahead 스케줄러. AudioContext는 sound.ts와 공유
      renderer.ts            # 캔버스 그리기
      constants.ts, types.ts
    gold-escape/             # Phaser 기반 게임 (구조는 아래 "Gold Escape" 참고)
      config.ts              # 속도·시간·점수·회차 배율 등 모든 밸런스 값
      stages.ts              # 스테이지 맵 문자열 (범례는 logic/level.ts)
      logic/                 # 순수 TS 규칙: level, terrain(이동 규칙), pathfinding(BFS), simulation
      controller.ts          # 고정 스텝(1/60초) 진행 + HUD 구독 (Phaser 비의존)
      input.ts               # 키보드·터치 공용 입력 상태
      render/                # Phaser 장면, 픽셀아트(sprites.ts), createPhaserGame.ts
      GoldEscapeGame.tsx     # React: Phaser 마운트, HUD, 오버레이, 터치 버튼, 사운드 토글
      audio/                 # 효과음·BGM: cues(이벤트→효과음, 순수 함수), sfx, music(16마디 루프), tension(추격 판정), GoldEscapeAudio
    star-vanguard/           # Phaser 기반 우주 슈팅 (Gold Escape와 같은 구조, 아래 "Star Vanguard" 참고)
      config.ts              # 속도·탄 상한·웨이브 난이도(difficulty)·보스·파워업 등 모든 밸런스 값
      logic/                 # 순수 TS 규칙: rng(시드 난수), paths(베지어 경로), waves(편대 구성), simulation
      controller.ts, input.ts, sound.ts(Web Audio 합성 효과음), render/, StarVanguardGame.tsx
      music.ts               # BGM 두 곡(일반 전투·보스)과 전환 관리. 공용 lib/audio/loopPlayer 사용
    lost-relic/              # Phaser 기반 방 단위 탐험 어드벤처 (아래 "Lost Relic" 참고)
      rooms.ts               # 8개 방 지도 문자열·오브젝트(markers)·출입구. 연결도와 진행 순서는 파일 상단 주석
      config.ts, items.ts    # 밸런스 값 / 아이템 이름·설명·아이콘 픽셀아트
      logic/                 # 순수 TS: world(지도 해석·타일 조회), physics(이동·충돌·사다리), simulation(규칙),
                             #   navigation·progression(지도 검증용 BFS·진행 탐색기, 테스트 전용), *.test.ts
      save.ts                # 진행 저장 형식·검증(손상 데이터 거부)
      controller.ts, input.ts, useLostRelic.ts, LostRelicGame.tsx, render/, audio/(cues·sfx·music 3곡·LostRelicAudio)
    winter-blocks/           # Canvas 2D 낙하형 블록 퍼즐 (Phaser 미사용, 아래 "Winter Blocks" 참고)
      config.ts              # 6단계 레벨표·낙하 간격·점수·방해 요소 간격·저장 키
      logic/                 # 순수 TS: pieces(7종·회전·벽 밀기 표), game(상태 전이·혹·얼음·바람·눈·점수), game.test.ts
      controller.ts, input.ts, useWinterBlocks.ts, WinterBlocksGame.tsx, renderer.ts(캔버스·배경 눈)
      audio/                 # instruments(오르골·첼레스타·종·썰매 방울·패드·피치카토 합성), songs(BGM 3곡), sequencer, sfx, cues, WinterAudio
    cannon-rivals/           # Canvas 2D 턴제 포격 대전 (Phaser 미사용, 아래 "Cannon Rivals" 참고)
      config.ts              # 물리·피해·아이템·에너지·코인·전장 3종·AI 난이도 등 모든 밸런스 값
      logic/                 # 순수 TS: physics(고정 스텝 탄도), terrain(높이맵·구덩이·검증), game(턴·착탄·낙하·아이템), ai(탄도 탐색·오차),
                             #   rng, simulate·testUtils(테스트 전용), *.test.ts
      profile.ts             # 코인·전적·상점 구매 저장 형식과 검증(보상 중복 방지)
      controller.ts, useCannonRivals.ts, CannonRivalsGame.tsx, renderer.ts, audio/(cues·sfx·music 3곡·CannonAudio)
    turbo-kart/              # Canvas 2D 탑다운 카트 레이싱 (Phaser 미사용, 아래 "Turbo Kart" 참고)
      config.ts              # 차량 물리·드리프트·부스터·아이템 효과·순위별 아이템 확률·난이도·AI 성향 이름 등 밸런스 값
      tracks.ts              # 트랙 3종 데이터: 중심선 제어점·도로 폭·지름길·체크포인트 수·상자 줄·난이도 등급별 장애물·미끄러운 구간
      logic/                 # 순수 TS: track(스플라인·거리장·진행 투영), physics(카트 물리·충돌), game(레이스 규칙·아이템·복구), ai(웨이포인트 추종),
                             #   rng, testUtils(테스트 전용), *.test.ts
      records.ts             # 기록 저장 형식·검증
      camera.ts              # 회전(chase)·고정(topdown) 카메라: 화면 변환·보간·컬링 범위 (그리기 전용, camera.test.ts)
      input.ts, controller.ts, useTurboKart.ts, TurboKartGame.tsx, renderer.ts(Path2D 트랙·미니맵·캔버스 HUD), audio/(cues·sfx·music 3곡·KartAudio)
    frosty-roll/             # Canvas 2D 고정 화면 눈덩이 플랫폼 액션 (아래 "Frosty Roll" 참고)
      config.ts, stages.ts   # 밸런스 값 / 스테이지 5개 지도(32×16)·바람·움직이는 발판
      logic/                 # 순수 TS: level(지도·발판), physics(moveBody), game(규칙), rng, testUtils·*.test.ts(reach: 도달 가능성)
      render/                # pixels(픽셀 격자·자동 외곽선), sprites(캐릭터·적·아이템), scenery(배경·타일), renderer
      audio/                 # sfx(효과음), music(BGM 2곡), FrostyAudio(이벤트→효과음)
      controller.ts, input.ts, useFrostyRoll.ts, FrostyRollGame.tsx
    bubble-pop-adventure/    # Canvas 2D 고정 화면 방울 포획 플랫폼 액션 (아래 "Bubble Pop Adventure" 참고)
      config.ts, stages.ts   # 밸런스 값 / 스테이지 5개 지도(32×16)·방울 모이는 지점(gather)·바람·움직이는 발판
      logic/                 # 순수 TS: level, physics(moveBody), game(규칙·방울·콤보·보스), rng, testUtils·*.test.ts(reach: 도달 가능성)
      render/                # pixels(픽셀 격자·자동 외곽선), sprites(Lumi·기계 요정·Chime Queen·방울·아이템), scenery(배경·타일), renderer
      audio/                 # sfx(효과음), music(BGM 2곡), BubbleAudio(이벤트→효과음)
      controller.ts, input.ts, useBubblePop.ts, BubblePopGame.tsx
  lib/
    audio/                   # 공용 8비트 사운드: synth(톤·노이즈·VoiceTracker·createAudioContext), loopPlayer(look-ahead BGM 재생기),
                             #   unlock(모든 게임 AudioContext 등록·사용자 입력/탭 복귀 때 resume·막힘 감지, iOS 대응)
    games.ts                 # 게임 조회 헬퍼 (getAllGames, getGameBySlug, getGamePath ...)
    seo.ts                   # 색인 대상 게임·게임 title/description/canonical·sitemap 항목·홈 description (seo.test.ts)
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
7. 라우트·메타데이터·sitemap(홈·소개 lastmod 포함)·홈 description은 `src/lib/seo.ts`를 통해 자동 반영된다. 1번 이후 2·4번이 빠지면 타입 에러가 난다.
8. `npm run test:seo` → `npm run build` → `npm run test:seo:build`로 확인한다. 게임 설명을 크게 고치면 `updatedAt`을 그날로 바꾼다(sitemap lastmod).

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

- 사운드는 `audio/`에만 둔다. 시뮬레이션 이벤트·컨트롤러 `onFrame`을 읽기만 하며 게임 규칙을 바꾸지 않는다.
  효과음·BGM은 기본 꺼짐이고 게임별 저장 키(`config.ts`의 `sfxStorageKey`·`musicStorageKey`)를 쓴다.

### Star Vanguard (Phaser)
- Gold Escape와 같은 규칙을 따른다: `phaser`는 `render/` 안에서만 import, `createPhaserGame`은 `useEffect`의 동적 `import()`로만 로드,
  규칙은 `logic/`에만 두고 장면은 `GameState`를 읽어 그리기만 한다. 밸런스 값은 `config.ts`에서만 바꾼다.
- 시뮬레이션의 난수는 `logic/rng.ts`(시드 저장: `GameState.rng`)만 쓴다. `Math.random()`은 별 배경·폭발 파편·잡음 버퍼 같은 연출에만 쓴다.
- 적은 hp가 0이 되는 순간 `killEnemy`에서 한 번만 점수를 지급하고 목록에서 빠진다. 웨이브는 `enemies`가 비었을 때만 끝난다
  (급강하로 화면 밖에 나간 적도 목록에 남으므로 웨이브가 멈추거나 일찍 끝나지 않는다).
- 피할 수 없는 탄막 방지: 탄 수 상한(`difficulty().bulletCap`, 보스 `extraBulletCap`), `noFireBelowY`, `maxAimAngleDeg`, 부채꼴 간격을 유지한다.
- 저작권: 그래픽은 `render/sprites.ts`의 자체 픽셀아트, 소리는 `sound.ts`의 실시간 합성만 쓴다. 기존 상용 게임의 이름·캐릭터·편대/진입 패턴·음원을
  가져오지 않는다. 외부 에셋을 추가하면 상업적 이용 가능 여부와 출처·라이선스를 기록한다.

### Lost Relic (Phaser)
- Gold Escape·Star Vanguard와 같은 규칙을 따른다: `phaser`는 `render/` 안에서만 import, `createPhaserGame`은 `useEffect`의 동적 `import()`로만 로드,
  규칙은 `logic/`에만 두고 장면은 `GameState`를 읽어 그리기만 한다. 밸런스 값은 `config.ts`에서만 바꾼다.
- 방은 정확히 8개(32×18 타일, 고정 화면)이며 확장하지 않는다. 지도 범례는 `rooms.ts` 상단 주석, 해석은 `logic/world.ts`.
  닫힌 문·덮개는 `makeTileQuery`가 solid로 돌려주므로 물리와 지도 검증이 같은 규칙을 쓴다.
- 진행 상태(열린 상자·문, 비밀, 퍼즐, 유물)는 `GameState.flags` 문자열로만 기록하고, 점수는 플래그가 처음 세워질 때 한 번만 준다.
  필수 아이템(`items.ts`의 `essential`)은 맞는 장소가 아니면 절대 소모하지 않는다.
- 지도·출입구·오브젝트를 바꾸면 반드시 `npm run test:lost-relic`을 돌린다. `progression.test.ts`가 모든 방 도달, 막다른 상태 없음,
  열쇠가 자기 문 뒤에 있지 않음을 실제 상호작용 규칙으로 검증하고, `simulation.test.ts`가 모든 출입구를 실제 물리로 왕복하고 처음부터 탈출까지 따라간다.
- 저장: `my-game-hub:lost-relic:save`(진행), `:best-score`, `:best-time`, `:sound`, `:music`. 저장 형식을 바꾸면 `save.ts`의 `SAVE_VERSION`을 올린다.
- 개발 서버에서만 `window.__LOST_RELIC__`(컨트롤러·오디오·teleport)이 노출된다(브라우저 테스트용, 프로덕션 빌드에서 제거).
- 저작권: 1982년 Aztec의 탐험 장르만 참고했다. 그래픽(`render/sprites.ts`, `items.ts`)·지도·퍼즐·효과음·BGM은 모두 자체 제작이며 외부 에셋이 없다.

### Winter Blocks (Canvas 2D)
- 블록 한 개의 순서는 바꾸지 않는다: 생성 → 이동·회전 → 낙하 → 착지 → 4칸 고정 → 혹 생성(+방해 효과) → 줄 검사 → 다음 블록.
  낙하 중인 블록은 항상 4칸이며, 혹은 `logic/game.ts`의 `lockActive`에서 고정 이후에만 판에 추가한다.
- 난수는 `GameState.rng`(시드)만 쓴다. `Math.random()`은 배경 눈·시드 생성 같은 연출에만 쓴다.
- 얼음 줄: 완성 시 금이 가고(cracked) 남았다가, 다음 고정 뒤 줄 검사에서 여전히 완성이면 제거한다.
- 방해 효과(얼음·바람·눈)는 한 번에 하나만: `hazards.cooldown`과 "예고 중인 바람·눈이 있으면 다른 효과 보류" 규칙을 유지한다.
- 낙하 간격 하한은 `minGravity`(0.65초). 레벨 6 이후 난이도를 올리지 않는다.
- BGM은 `lib/audio/loopPlayer` 대신 이 게임 전용 `audio/sequencer.ts`(악기 합성)를 쓴다. 기본값은 효과음·BGM 모두 꺼짐, 곡은 Snowy Night.
- 개발 서버에서만 `window.__WINTER_BLOCKS__`(컨트롤러·오디오)가 노출된다.
- 저작권: 장르 규칙만 참고했다. 다른 블록 퍼즐 게임의 이름·로고·그래픽·음악을 쓰지 않고, 게임 설명에서도 상표명을 쓰지 않는다.

### Cannon Rivals (Canvas 2D)
- 규칙은 `logic/`에만 둔다. 플레이어 발사·AI 탐색·탄도 가이드가 모두 `logic/physics.ts`의 `stepBody`(1/240초 단계 충돌 검사)를 쓰므로
  물리를 바꿀 때 한 곳만 고친다. 지형은 높이맵(`terrain[x]` = 지면 y, `WORLD_H` = 낭떠러지)이며 렌더러가 같은 배열을 그린다.
- 난수는 `GameState.rng`(시드)만 쓴다. `Math.random()`은 renderer의 파편·연기 같은 연출과 시드 생성에만 쓴다.
- AI는 현재 상태(위치·바람·지형·상자)만 읽고 미래 정보를 쓰지 않는다. 결정당 시뮬레이션 수는 `AI_SIM_BUDGET` 이하.
  난이도 값(`DIFFICULTY`)을 바꾸면 `npm run test:cannon-rivals`의 첫 발 명중률 목표(쉬움 15~25%, 보통 30~45%, 어려움 50~65%)를 다시 확인한다.
- 아이템은 한 턴에 하나, FIRE 때 소모한다. 보상은 `profile.ts`의 `rewardBattle`이 전투 번호당 한 번만 지급한다. 저장 형식을 바꾸면 `PROFILE_VERSION`을 올린다.
- 저장: `my-game-hub:cannon-rivals:profile`(코인·전적·구매 목록), `:sound`, `:music`. 효과음·BGM 기본 꺼짐.
- 개발 서버에서만 `window.__CANNON_RIVALS__`(컨트롤러·오디오)가 노출된다.
- 저작권: 포격 대전 장르 규칙만 참고했다. 탱크·전장 그래픽(`renderer.ts`)·BGM 3곡·효과음은 모두 자체 제작이며 외부 에셋이 없다.
  다른 포격 게임의 이름·캐릭터·UI를 쓰지 않고, 게임 설명·키워드에도 다른 게임의 상표명을 쓰지 않는다.

### Turbo Kart (Canvas 2D)
- 규칙은 `logic/`에만 둔다. 플레이어와 AI는 같은 `DriveInput` → `physics.ts`(고정 1/60초, 충돌 2단계)를 쓴다. AI의 물리 값(최고 속도·가속)은 성향·난이도와 무관하게 같다.
- 조향은 입력을 각도에 바로 쓰지 않는다: 입력(-1·0·1) → `steerValue`(시간 기반 이동) → 목표 각속도(`yawLimit`: 속도가 높을수록 작음, 부스터 중 더 작음) → `yawRate`(지수 보간, 풀 때 더 빠른 감쇠) → heading.
  각속도 상한 `STEERING.yawCap`, 슬립각 제한 `maxSlipAngle`(스핀 방지), 세게 부딪히면 `collisionYawKeep`만 남긴다. 값은 config의 `STEERING`에서만 바꾼다.
- 드리프트는 자동이다(입력·버튼 없음, 플레이어·AI 공통): 빠른 속도 + 강한 조향 유지로 진입, 조향을 풀면 종료(히스테리시스, config의 `DRIFT`).
  조향·드리프트 값을 바꾸면 `npm run test:turbo-kart`의 `steering.test.ts`(짧은 탭·회피·고속 코너·부스터·충돌·방향키만으로 한 바퀴)와 `controls.test.ts`(30/60/120FPS·터치)를 다시 확인한다.
- 좌표는 월드 좌표만 규칙에 쓴다. 카메라(`camera.ts`)는 그리기 전용이다. 기본 "chase"는 카트를 화면 아래 가운데(anchorY)에 두고
  카트 전방이 화면 위를 향하도록 월드를 돌려 그린다(지수 보간 + 최대 회전 속도 제한, 스핀 중 회전 정지). "topdown"은 북쪽이 위인 고정 시점.
  조향 입력은 항상 카트 기준이며 카메라와 무관하다. 미니맵·HUD는 화면 고정(미니맵은 북쪽이 위). 회전 시 컬링은 `viewBounds`(화면 네 모서리 역변환)를 쓴다.
- 진행·순위: 직전 위치 주변에서만 코스 위 위치를 다시 찾고(`projectProgress`) 변화량만큼 `dist`를 더한다. 체크포인트는 `dist`가 다음 체크포인트를 넘을 때 하나씩만 센다(순서 건너뛰기·역주행·왕복 악용 불가).
- 벽: 메인 도로와 지름길이 겹치는 곳은 합친 영역이 주행 가능 영역이다(`wallContact`). 도로 판정을 바꿀 때 이 규칙을 유지한다.
- 난이도는 장애물·상자·미끄러운 구간·아이템 확률만 바꾼다. `tracks.ts`의 장애물 `tier`로 쉬움 4~6 · 보통 8~10 · 어려움 12~15개, 움직이는 장애물 0 · 1~2 · 3~4개를 유지한다.
- 트랙·장애물을 바꾸면 `npm run test:turbo-kart`를 돌린다(도로 겹침, 빈 폭, 분기점 근처 장애물, AI 4대 완주·순간이동·벽 통과 검사).
- 난수는 `RaceState.rng`(시드)만 쓴다. `Math.random()`은 renderer 연출과 시드 생성에만 쓴다.
- 저장: `my-game-hub:turbo-kart:records`, `:sound`, `:music`, `:camera`(1 = 회전 기본, 0 = 고정). 효과음·BGM 기본 꺼짐. 개발 서버에서만 `window.__TURBO_KART__`(컨트롤러·오디오) 노출.
- 저작권: 탑다운 카트 레이싱 장르만 참고했다. 카트·트랙·장애물 그래픽, BGM 3곡, 효과음은 모두 자체 제작이며 외부 에셋이 없다. 상용 레이싱 게임의 이름·캐릭터·트랙·음악을 쓰지 않는다.

### Frosty Roll (Canvas 2D)
- 규칙은 `logic/`에만 둔다. 플레이어·적·눈덩이·아이템·톱니가 모두 `logic/physics.ts`의 `moveBody`(축별 충돌, 발판은 위에서만 착지)를 쓴다. 고정 1/60초.
- 적 상태: active(눈 0~2) → ball(갇힘, 탈출 타이머·금) → rolling(차서 굴림) → dead. 굴러가는 눈덩이가 쓰러뜨린 수가 연쇄(`chain`)이며
  점수는 `CHAIN_POINTS`로 쓰러지는 순간 한 번만 준다. 굴러가는 눈덩이는 플레이어에게 피해를 주지 않는다. 벽 반동 `BALL.maxBounces` 뒤 다음 벽에서 부서진다.
- 스테이지 클리어는 굴러가는 눈덩이까지 모두 사라졌을 때다(연쇄가 끝까지 이어짐). 보스는 굴린 눈덩이로만 맞고, 눈덩이 재료가 떨어지지 않도록 졸개를 소환한다.
- 지도·적 배치를 바꾸면 `npm run test:frosty-roll`을 돌린다(`reach.test.ts`가 실제 점프 물리로 모든 발판·적 위치 도달, 자동 플레이 테스트가 5스테이지 클리어를 검사).
- 난수는 `GameState.rng`(시드)만 쓴다. `Math.random()`은 renderer 연출과 시드 생성에만 쓴다. 화면 흔들림은 상태가 요청만 하고 렌더러가 설정에 따라 적용한다.
- 저장: `my-game-hub:frosty-roll:high-score`, `:checkpoint`, `:sound`, `:music`, `:shake`, `:easy-push`. 효과음·BGM 기본 꺼짐. 개발 서버에서만 `window.__FROSTY_ROLL__` 노출.
- 저작권: 1990년대 오락실 눈덩이 플랫폼 장르의 일반 규칙만 참고했다. 북극여우·적·보스·배경 그림(`render/`), 스테이지 배치, BGM 2곡과 효과음은 모두 자체 제작이며 외부 에셋이 없다.
  다른 게임의 이름·캐릭터·스테이지·음악을 쓰지 않고, 게임 설명·키워드에도 다른 게임의 상표명을 쓰지 않는다. "Frosty Roll"은 가칭이므로 정식 공개 전 상표 중복을 확인한다.

### Bubble Pop Adventure (Canvas 2D)
- 규칙은 `logic/`에만 둔다. 플레이어·적·아이템은 `logic/physics.ts`의 `moveBody`(고정 1/60초)를 쓰고, 방울은 `game.ts`의 `moveBubble`로 벽(`#`)에만 막히며 발판은 통과한다.
- 방울: shot(약 5칸, 닿은 적을 가둠) → float(상승, 바람 스테이지는 옆으로 밀림, 천장에 닿으면 `stage.gather` 중 가장 가까운 x로 모임).
  플레이어가 닿으면 터지고, 닿아 있는 방울은 `chainDelay` 간격으로 함께 터진다. `COMBO.window` 안에 이어 쓰러뜨린 수가 콤보이며 점수는 `COMBO_POINTS`로 쓰러지는 순간 한 번만 준다.
  점프 키를 누른 채 위에서 밟으면 터지지 않고 `bounceVelocity`로 튕긴다. 갇힌 적은 `escapeTime` 뒤 탈출(화남).
- `stage.gather`는 플레이어가 발판에서 뛰어 닿을 수 있는 곳 위에 둔다(`reach.test.ts`가 검사). 보스 Chime Queen은 방울에 갇히지 않고, 갇힌 적을 터뜨릴 때 나오는 별빛 조각(`sparks`)으로만 맞는다.
- 지도·적 배치·gather를 바꾸면 `npm run test:bubble-pop-adventure`를 돌린다(실제 점프 물리로 모든 발판·적·모이는 지점 도달, 자동 플레이로 5스테이지 클리어).
- 난수는 `GameState.rng`(시드)만 쓴다. `Math.random()`은 renderer 연출과 시드 생성에만 쓴다. 화면 흔들림은 상태가 요청만 하고 렌더러가 설정에 따라 적용한다.
- 저장: `my-game-hub:bubble-pop-adventure:high-score`, `:checkpoint`, `:sound`, `:music`, `:shake`. 효과음·BGM 기본 꺼짐. 개발 서버에서만 `window.__BUBBLE_POP__` 노출.
- 저작권: 1980년대 오락실 방울 포획 플랫폼 장르의 일반 규칙만 참고했다. 별빛 정령 Lumi·기계 요정·Chime Queen·배경(`render/`), 스테이지 배치, BGM 2곡과 효과음은 모두 자체 제작이며 외부 에셋이 없다.
  다른 게임의 이름·캐릭터·스테이지·음악을 쓰지 않고, 게임 설명·키워드에도 다른 게임의 상표명을 쓰지 않는다. "Bubble Pop Adventure"는 가칭이므로 정식 공개 전 상표 중복을 확인한다.

### 사운드 공통 (iOS Safari 대응)
- 모든 게임은 Web Audio API만 쓴다(HTMLAudioElement 없음). AudioContext는 반드시 `lib/audio/synth.ts`의 `createAudioContext()`로 만든다
  (무음 1샘플 재생 + `lib/audio/unlock.ts` 자동 등록). 재생 재개는 `resumeAudioContext`, 일부러 멈출 때(효과음·BGM 모두 끔)는 `suspendAudioContext`,
  화면을 떠날 때는 `closeAudioContext`를 쓴다. `ctx.resume()`·`suspend()`·`close()`를 직접 부르지 않는다(거부된 Promise·막힘 감지 누락).
- iOS·HTML 표준은 터치의 `pointerdown`·`touchstart`를 사용자 활성화로 인정하지 않는다(`touchend`·`pointerup`·`click`·`keydown`만 인정).
  unlock.ts가 이 입력들을 캡처 단계에서 받아 멈춘 컨텍스트를 깨우므로, 게임 코드에서 pointerdown으로 unlock()해도 손을 떼는 순간 소리가 풀린다.
- 탭 복귀(`visibilitychange`)·bfcache 복원(`pageshow`) 때 resume을 시도하고, 그래도 막혀 있으면 `components/AudioResumeButton`(레지스트리 GameLoader에 포함)이
  "소리 다시 켜기" 버튼을 보여 준다. 소리를 켠 경우에만 `navigator.audioSession.type = "playback"`(Safari 16.4+, 없으면 무시)으로 지정한다.
- 효과음·BGM 기본 꺼짐과 게임별 저장 키는 그대로 유지한다. 사운드가 없는 게임에 BGM을 새로 넣지 않는다.

### Snake Classic 조작
- 모바일은 화면 아래 십자 방향 버튼(`SnakeGame.tsx`의 DirectionPad, 터치 기기에서만 표시, 56px, pointerdown 즉시 반응)으로 방향을 바꾼다. 스와이프는 쓰지 않는다.
  보드 터치는 시작·재개·재시작만 한다(플레이 중 일시정지는 Pause 버튼). 키보드(방향키·WASD)와 버튼이 같은 `turn` 액션을 쓰고,
  180도 반전 방지·연속 입력 예약은 `logic.ts`의 `queueTurn`이 맡는다. 레이아웃을 바꾸면 iPhone SE(375×667)에서도 보드~방향 버튼이 한 화면에 들어오는지 확인한다.

### 광고 (AdSense)
- 광고는 반드시 `src/components/AdSlot.tsx`를 통해서만 넣는다. 실제 스크립트는 아직 연결하지 않았다.
- 게임 페이지 광고 위치는 `GamePageLayout`이 정한다(본문 아래 banner, 데스크톱 sidebar). 게임 화면 바로 위·아래에는 광고를 두지 않고,
  세로 방향으로는 항상 소개·조작·규칙 본문이 게임과 광고 사이에 오게 한다. 사이드바는 게임 열과 48px 이상 떨어뜨린다.
  **게임 조작 영역(`게임 플레이 영역` section) 안이나 조작 버튼 바로 옆에 광고를 넣지 않는다.** 오클릭을 유도하는 배치는 AdSense 정책 위반이다.
- AdSlot은 variant별 최소 높이를 확보해 CLS를 막는다. 새 위치는 기존 variant(banner/rectangle/sidebar)를 재사용한다.
- `NEXT_PUBLIC_ADSENSE_CLIENT`가 없으면 프로덕션에서는 아무것도 렌더링하지 않고, 개발 환경에서는 자리 표시 박스를 렌더링한다.

### SEO
- 브랜드 표기는 `siteConfig.name`("artcoding game")·`siteConfig.alternateName`("artcoding")만 쓴다. 문자열로 하드코딩하지 않는다.
  한국어 조사는 받침 기준("artcoding game은/이")으로 쓴다.
- 홈에는 schema.org `WebSite` JSON-LD가 하나만 있다(`src/app/page.tsx`). 게임 페이지의 `VideoGame` JSON-LD는 `isPartOf`로 이를 가리킨다.
- 페이지 OG·Twitter는 `socialMetadata()`(`src/lib/site.ts`)로 만든다. 페이지의 openGraph는 layout 것을 통째로 덮어쓰므로 직접 쓰지 않는다.
- 게임별 title/description/keywords/OG는 `src/data/games.ts` 값으로 `generateMetadata`에서 생성한다. 페이지에 직접 하드코딩하지 않는다.
  `features`(주요 특징)는 게임 페이지 본문에 HTML 텍스트로 노출된다.
- `description`은 120~160자 내외의 자연스러운 한국어 문장으로 쓴다.
- 공식 도메인은 `https://www.artcoding-game.app` (`src/lib/site.ts`의 `SITE_URL`). canonical·OG·JSON-LD·sitemap·robots가 모두 이 값을 쓴다.
  절대 URL은 `absoluteUrl(path)`로 만들고, www 없는 주소나 다른 도메인을 하드코딩하지 않는다.
- 새 공개 페이지를 만들면 `src/lib/seo.ts`의 `PUBLIC_PAGES`에 추가한다(게임 페이지는 `games.ts`에서 자동 반영).
  sitemap에는 canonical과 같은 대표 URL만 넣는다(alias·준비 중 게임·404 제외). Google의 sitemap ping은 폐지되었으므로
  Search Console에 sitemap을 한 번 제출해 두면 이후에는 크롤러가 lastmod를 보고 새 페이지를 찾는다.
- 공개 페이지 metadata에는 `robots: INDEXABLE`(index, follow)과 `alternates.canonical`을 함께 넣는다. 루트 layout에는 robots를 두지 않는다
  (404 페이지에 상속되면 Next.js가 자동으로 넣는 noindex와 충돌한다).
- 없는 주소는 404 + noindex가 된다. 외부에 알려진 예전·짧은 게임 주소는 `games.ts`의 `aliases`에 등록하면 308 리디렉션된다(`next.config.ts`).

### 정책 페이지 / 운영자 정보
- 운영자 이름·이메일·시행일 등은 `src/lib/site.ts`의 `operatorConfig`에서만 관리한다. `null`이면 `<TodoMark>`가 "[확인 필요]"로 표시하고, 값을 채우면 자동으로 사라진다.
- 코드로 값을 넣을 수 없는 확인 사항(로그 보존 기간, 배포 리전 등)은 `<TodoMark label="..."/>`와 `{/* TODO: ... */}` 주석으로 표시한다. `grep -rn "TODO" src`로 전체 목록을 볼 수 있다.
- 개인정보처리방침에는 **실제로 사용 중인 서비스만** 적는다. 현재: Vercel 호스팅 로그, Vercel Web Analytics(쿠키 없음, `layout.tsx`의 `<Analytics />`), 이메일 문의, localStorage(최고 점수, 게임별 사운드 설정, Lost Relic 진행 저장·최단 기록, Cannon Rivals 게임 내 코인·전적·구매 아이템, Turbo Kart 트랙별 기록, Frosty Roll·Bubble Pop Adventure 최고 점수·체크포인트·설정). 쿠키·광고·Google Analytics는 없음.
- AdSense나 분석 도구를 연결하는 변경에는 반드시 개인정보처리방침 개정(쿠키, 맞춤 광고 해제 방법, 위탁·국외 이전 표)을 포함한다. 방침 파일 상단 주석의 체크리스트를 따른다.
- 연락처 이메일을 코드에 하드코딩하지 않는다(`operatorConfig.email` 사용).

### 코드 스타일
- import 경로는 `@/` alias를 사용한다 (`@/components/...`, `@/lib/...`).
- 스타일은 Tailwind 유틸리티 클래스로 작성하고, 라이트/다크 모드(`dark:`)를 함께 고려한다.
- UI 문구는 한국어, 코드 식별자는 영어로 쓴다.
