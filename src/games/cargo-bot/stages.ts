import type { Difficulty } from "./config";

/*
 * 스테이지 15개. 모두 이 게임을 위해 새로 만든 배치다(기존 창고 퍼즐 게임의 맵을 옮기지 않음).
 *
 * 범례 (logic/level.ts가 해석):
 *   ' ' 창고 바깥   '#' 벽   '-' 바닥   'o' 목표   'B' 상자   'X' 목표 위 상자   'P' 로봇   'p' 목표 위 로봇
 *   '^' '>' 'v' '<' 컨베이어(화살표 방향)   '~' 얼음   '%' 얼음 위 목표   '1'~'4' 순간이동 장치(같은 숫자 두 개가 한 쌍)
 *
 * 설계: 방 구조·벽·특수 타일 배치(퍼즐 아이디어)를 정한 뒤, 해답 탐색기(logic/solver.ts)로 상자·목표 위치를 검토해 골랐다.
 * 기믹 스테이지는 "기믹이 해법을 바꾼다"(7~9·13은 기믹 없이는 풀 수 없음)를 확인했다.
 * par.pushes·par.moves는 탐색기가 찾은 최소 밀기·최소 이동 수이며 logic/stages.test.ts가 다시 검증한다.
 * 검증된 해답은 solutions.ts(개발용 데이터, 화면에 노출하지 않음)에 있다.
 */

export interface StageSpec {
  id: number;
  name: string;
  /** 개발용: 이 스테이지의 퍼즐 아이디어 */
  idea: string;
  difficulty: Difficulty;
  /** 힌트 1단계부터 차례로 보여 줄 전략 문장 (해답을 그대로 알려 주지 않는다) */
  hints: string[];
  /** 검증된 최소 기록 */
  par: { pushes: number; moves: number };
  map: string[];
}

export const STAGES: StageSpec[] = [
  {
    id: 1,
    name: "First Delivery",
    idea: "상자 하나를 목표까지 밀기",
    difficulty: 1,
    hints: ["Walk into a crate to push it. Push it onto the glowing lamp."],
    par: { pushes: 2, moves: 3 },
    map: [
      "#######",
      "#-----#",
      "#P-B-o#",
      "#-----#",
      "#######",
    ],
  },
  {
    id: 2,
    name: "Around the Pillar",
    idea: "벽을 돌아 다른 방향에서 밀기",
    difficulty: 1,
    hints: ["You can only push, never pull. After pushing a crate as far as it should go, walk around to push it from another side."],
    par: { pushes: 5, moves: 7 },
    map: [
      "########",
      "#---#--#",
      "#PB----#",
      "#---#-o#",
      "########",
    ],
  },
  {
    id: 3,
    name: "Corner Trap",
    idea: "구석 = 데드락",
    difficulty: 1,
    hints: ["A crate pushed into a corner can never move again. Look for the gap that lets the crate go down before it reaches the corner.", "Push the crate down through the middle gap first, then along the bottom row."],
    par: { pushes: 4, moves: 13 },
    map: [
      "########",
      "#------#",
      "#P-B---#",
      "#-#-##-#",
      "#----o-#",
      "########",
    ],
  },
  {
    id: 4,
    name: "Stack the Bay",
    idea: "상자 두 개와 넣는 순서",
    difficulty: 2,
    hints: ["The loading bay is a dead end. The first crate must go all the way in, or it will block the second one."],
    par: { pushes: 9, moves: 22 },
    map: [
      "########",
      "#oo---##",
      "###-B--#",
      "  #--B-#",
      "  #-P--#",
      "  ######",
    ],
  },
  {
    id: 5,
    name: "Narrow Aisles",
    idea: "좁은 통로에서 미는 위치 계산",
    difficulty: 2,
    hints: ["In a one-tile aisle you can only push straight. Line each crate up with its aisle before you push it in.", "Deal with the crate that blocks the middle aisle first."],
    par: { pushes: 13, moves: 43 },
    map: [
      "#########",
      "#--o#P--#",
      "#-#-#-#-#",
      "#----B--#",
      "###-#B###",
      "  #--o#",
      "  #####",
    ],
  },
  {
    id: 6,
    name: "Three Crates",
    idea: "상자 세 개의 정통 창고 퍼즐",
    difficulty: 3,
    hints: ["Plan the order: fill the deepest lamps first so later crates do not block the way.", "Crates pushed against a wall can only slide along that wall."],
    par: { pushes: 16, moves: 67 },
    map: [
      " ######",
      "##----#",
      "#o-##B#",
      "#--BP-#",
      "#B#-#-##",
      "#oo----#",
      "###--#-#",
      "  #----#",
      "  ######",
    ],
  },
  {
    id: 7,
    name: "Belt Express",
    idea: "컨베이어 소개: 벨트가 모서리를 돌아 옮겨 준다",
    difficulty: 2,
    hints: ["Conveyor belts carry crates in the arrow direction, even around corners where you could never push.", "The belt drops a crate on the first lamp. Push that crate one tile further before sending the next one."],
    par: { pushes: 7, moves: 22 },
    map: [
      "#########",
      "#>>>>>>v#",
      "#------v#",
      "#B#--#-v#",
      "#--P---o#",
      "###B#--o#",
      "  #-----#",
      "  #######",
    ],
  },
  {
    id: 8,
    name: "Edge Belt",
    idea: "컨베이어와 벽: 가장자리에 붙은 상자를 살리는 벨트",
    difficulty: 3,
    hints: ["A crate pushed onto the floor belt rides along the bottom wall and up the right side.", "Use the belt for the crate that must reach the top-right lamp."],
    par: { pushes: 12, moves: 37 },
    map: [
      "##########",
      "#-P-----o#",
      "#-##-###-#",
      "#B#----#-#",
      "#-#-##B#-#",
      "#-o------#",
      "#>>>>>>>^#",
      "##########",
    ],
  },
  {
    id: 9,
    name: "Two Belt Lines",
    idea: "여러 컨베이어 경로 중 고르기",
    difficulty: 3,
    hints: ["The top belt ends in the left aisle where all three lamps are. The bottom belt goes somewhere else.", "Send crates along the top row so the belt drops them into the left aisle, then push them down in order."],
    par: { pushes: 16, moves: 41 },
    map: [
      "##########",
      "#v<<<<<<<#",
      "#-B------#",
      "#-#-##B#-#",
      "#o-------#",
      "#o#-##-#B#",
      "#o-----P-#",
      "#>>>>>>>^#",
      "##########",
    ],
  },
  {
    id: 10,
    name: "Slippery Floor",
    idea: "얼음 소개: 멈출 때까지 미끄러진다",
    difficulty: 2,
    hints: ["Crates slide across ice until something stops them. A pillar is a perfect brake.", "Slide a crate along the row where the pillar stands, so it stops right on the lamp."],
    par: { pushes: 7, moves: 13 },
    map: [
      "##########",
      "#o--~~~~-#",
      "#---~~%#-#",
      "#---~~~~-#",
      "#-BB~#~~-#",
      "#P--~~~~-#",
      "##########",
    ],
  },
  {
    id: 11,
    name: "Ice Brakes",
    idea: "얼음 위 정지 위치 계산: 상자를 브레이크로",
    difficulty: 4,
    hints: ["A crate on ice keeps sliding past a lamp unless something is in the way.", "The first crate can act as a brake for the second one. Decide which lamp it should stop on."],
    par: { pushes: 19, moves: 57 },
    map: [
      "###########",
      "#----~~~~~#",
      "#----~~#~~#",
      "#----~~~~~#",
      "#-B#-~~~~##",
      "#-B--~#~~~#",
      "#P---~%%~~#",
      "###########",
    ],
  },
  {
    id: 12,
    name: "Belt to the Rink",
    idea: "얼음과 컨베이어 조합",
    difficulty: 4,
    hints: ["The belt throws crates onto the ice, where they slide to the far wall.", "One lamp is at the end of the belt-and-ice run, the other is on normal floor."],
    par: { pushes: 14, moves: 39 },
    map: [
      "##########",
      "#P---#---#",
      "#B---B~~~#",
      "#--#--~#~#",
      "#-----~~~#",
      "#>>>>>~~%#",
      "#-o------#",
      "##########",
    ],
  },
  {
    id: 13,
    name: "Teleport Bay",
    idea: "순간이동 소개",
    difficulty: 3,
    hints: ["A crate pushed onto a teleporter jumps to the pad with the same colour. You cannot teleport yourself.", "The crate can never pass the bends in the side corridors. Send it through the pad, then walk around."],
    par: { pushes: 8, moves: 32 },
    map: [
      "############",
      "#-----#----#",
      "#-----#----#",
      "#--1--#--1-#",
      "#-----#----#",
      "###-#####--#",
      "  #-#   #--#",
      "  #o#####B##",
      "  #P------#",
      "  #########",
    ],
  },
  {
    id: 14,
    name: "Frozen Relay",
    idea: "순간이동 + 얼음 + 컨베이어",
    difficulty: 4,
    hints: ["Teleported crates land on the pad in the ice room and stop there. Push them off the pad to slide them.", "A crate on ice needs a brake: a pillar, a wall or another crate."],
    par: { pushes: 18, moves: 67 },
    map: [
      "############",
      "#-----#~~~~#",
      "#--1B-#~#~~#",
      "#o-P--#~~~~#",
      "#-----#~%1~#",
      "#-##-##----#",
      "#----vB----#",
      "#----v>>>--#",
      "############",
    ],
  },
  {
    id: 15,
    name: "Grand Restore",
    idea: "모든 기믹을 쓰는 최종 퍼즐: 벨트 주머니(컨베이어 필수)·얼음 방(순간이동 필수, 얼음 정지 계산)·시작 방 정리",
    difficulty: 5,
    hints: ["Every system matters here: the top belt is the only way into the right-hand bay, and the teleporter is the only way into the ice room.", "In the ice room, a crate pushed off the pad slides until a wall stops it. Two slides reach the far corner lamp.", "Clear a path in the start room before you send crates away. The crate in the corridor goes up first."],
    par: { pushes: 20, moves: 48 },
    map: [
      "###############",
      "#>>>>>>>>v#####",
      "#---B---#v#####",
      "#-#-B#--#v#####",
      "#----o--#o#####",
      "#--1---B#######",
      "#o------#######",
      "###-###########",
      "  #-#  ########",
      "  #-#  #%~~~~-#",
      "  #B####~#~1~-#",
      "  #P-----~~~~-#",
      "  #############",
    ],
  },
];
