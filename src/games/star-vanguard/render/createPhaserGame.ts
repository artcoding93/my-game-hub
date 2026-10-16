import * as Phaser from "phaser";
import { GAME_CONFIG } from "../config";
import type { StarVanguardController } from "../controller";
import { StarVanguardScene } from "./StarVanguardScene";

/**
 * Phaser 게임 인스턴스를 만든다.
 * 이 모듈은 Phaser(브라우저 전용)를 import하므로 반드시 클라이언트에서 동적 import로만 불러온다.
 * 입력은 React 쪽(InputState)에서, 소리는 SoundEngine(Web Audio)에서 처리하므로 Phaser의 입력·오디오는 끈다.
 */
export function createPhaserGame(parent: HTMLElement, controller: StarVanguardController): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_CONFIG.width,
    height: GAME_CONFIG.height,
    pixelArt: true,
    backgroundColor: "#03030a",
    banner: false,
    audio: { noAudio: true },
    input: { keyboard: false, mouse: false, touch: false, gamepad: false },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: new StarVanguardScene(controller),
  });
}
