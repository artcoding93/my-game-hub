import * as Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import type { GoldEscapeController } from "../controller";
import { GoldEscapeScene } from "./GoldEscapeScene";

/**
 * Phaser 게임 인스턴스를 만든다.
 * 이 모듈은 Phaser(브라우저 전용)를 import하므로 반드시 클라이언트에서 동적 import로만 불러온다.
 * 입력은 React 쪽(InputState)에서 처리하므로 Phaser 입력 시스템은 끈다.
 */
export function createPhaserGame(parent: HTMLElement, controller: GoldEscapeController): Phaser.Game {
  const { width, height } = controller.state.level;
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: width * GAME_CONFIG.tileSize,
    height: height * GAME_CONFIG.tileSize,
    pixelArt: true,
    backgroundColor: "#06070d",
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new GoldEscapeScene(controller),
  });
}
