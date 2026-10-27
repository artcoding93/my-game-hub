/*
 * 개발용 데이터: 스테이지별 검증된 해답 (LURD 표기: u r d l = 걷기, U R D L = 밀기).
 * 최소 이동 해답이며 logic/stages.test.ts가 실제 엔진으로 다시 재생해 클리어되는지 검사한다.
 * 게임 화면은 이 파일을 쓰지 않는다(힌트는 현재 상태에서 탐색기로 다음 한 수만 계산한다).
 */

export const SOLUTIONS: Record<number, string> = {
  1: "rRR",
  2: "RRRRurD",
  3: "urrDDullddrRR",
  4: "uUruLLLrrrdrdLdlUUruLL",
  5: "rrddlLLLuullddRRddrrUULrddlluUUdrrrruullDDD",
  6: "LddllUURuurrrDDDuuulllddRRlddrddrruuLLLuuluurrrdDDullddLrrddrruuLLL",
  7: "llUUrrrrrrdDlddlllUUUU",
  8: "ldDDDrruurrrDulllddrrRdrrUUUUdddLLLLL",
  9: "rUUUUllDDDurrddlLLLLLruuuuullDDDrruuLulDD",
  10: "rUUddrUUlURuL",
  11: "uRRlUUluRRRurrDdldRlddlUUUluRurrDdldRurrDdrdLuuulDlldlldR",
  12: "DrrrdrruLLLulDDulDDRRRdrUluRurDdrddLLLL",
  13: "rrrrrrUUUUddddlllllluuuuruulDDDD",
  14: "rruLddddrRRdrUUrruulDrdLdlUruuLruulldDdDrddlluRRdrUUdllllluuuuLLulD",
  15: "UUUUUrrrrUUUUllLDuulDDDRlDrdLLrdddddrrrrrrrrUruL",
};
