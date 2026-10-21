// Node 내장 테스트 러너로 TypeScript 게임 로직을 바로 실행하기 위한 모듈 해석 훅.
// Node의 타입 제거(type stripping)는 확장자 없는 import와 "@/" 별칭을 해석하지 못하므로 여기서 보완한다.
// 사용: node --import ./scripts/ts-test-hooks.mjs --test <파일>
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    if (target.startsWith("@/")) target = new URL(target.slice(2), SRC).href;
    const isRelative = /^(\.\.?\/|\/|file:)/.test(target);
    if (isRelative && !/\.[cm]?[jt]s$/.test(target)) {
      const base = target.startsWith("/") ? pathToFileURL(target) : new URL(target, context.parentURL);
      for (const ext of [".ts", "/index.ts"]) {
        const candidate = fileURLToPath(base) + ext;
        if (existsSync(candidate)) return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
    return nextResolve(target, context);
  },
  load(url, context, nextLoad) {
    // 프로젝트는 "type": "module"이 아니므로 .ts 파일을 ES 모듈 TypeScript로 읽도록 알려 준다.
    if (url.endsWith(".ts")) return nextLoad(url, { ...context, format: "module-typescript" });
    return nextLoad(url, context);
  },
});
