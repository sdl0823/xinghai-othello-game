// js/stages.js - 10 關階梯制闖關設定與解鎖邏輯
const STAGES = [
  { stage: 1, title: "星海啟航・初遇靈狐", aiCharIdx: 3, sims: 250, c: 1.70, cornerW: 1.10, mobW: 1.10, xPen: 1.10, humanBlack: true, desc: "第 1 關：靈巧快攻的小星玖鎮守，先手執黑，適合熟悉棋盤邊角戰術。" },
  { stage: 2, title: "金鈴迴響・艦長巡航", aiCharIdx: 0, sims: 400, c: 1.50, cornerW: 1.20, mobW: 1.15, xPen: 1.15, humanBlack: true, desc: "第 2 關：小辰鈴艦長出陣，均衡搜尋與標準四角權重試煉。" },
  { stage: 3, title: "碧波奇襲・怒濤試煉", aiCharIdx: 2, sims: 550, c: 1.85, cornerW: 1.20, mobW: 1.25, xPen: 1.15, humanBlack: true, desc: "第 3 關：小鯨玖高探索廣域奇襲，考驗對突發邊線翻子的應變。" },
  { stage: 4, title: "星芒陣列・行動封鎖", aiCharIdx: 1, sims: 750, c: 1.20, cornerW: 1.30, mobW: 1.35, xPen: 1.35, humanBlack: true, desc: "第 4 關：小璃玖專注壓制玩家可行走步，星位防禦大幅增強。" },
  { stage: 5, title: "冰晶明鏡・中盤精算", aiCharIdx: 4, sims: 950, c: 1.30, cornerW: 1.35, mobW: 1.30, xPen: 1.35, humanBlack: true, desc: "第 5 關：小星璃守關，精算中盤各分支期望勝率。" },
  { stage: 6, title: "星紋覺醒・疾風後手", aiCharIdx: 3, sims: 1150, c: 1.45, cornerW: 1.30, mobW: 1.30, xPen: 1.30, humanBlack: false, desc: "第 6 關：小星玖執黑先手反攻，玩家需執白後手穩紮穩打。" },
  { stage: 7, title: "龍吟星域・金鈴鎮守", aiCharIdx: 0, sims: 1400, c: 1.35, cornerW: 1.40, mobW: 1.35, xPen: 1.45, humanBlack: true, desc: "第 7 關：高階小辰鈴艦長，四角控制與動態調適全面升級。" },
  { stage: 8, title: "滄海霸主・深淵巨鯨", aiCharIdx: 2, sims: 1700, c: 1.60, cornerW: 1.45, mobW: 1.40, xPen: 1.40, humanBlack: false, desc: "第 8 關：小鯨玖執黑狂瀾攻勢，高預算模擬下的極限奇襲。" },
  { stage: 9, title: "九尾星樞・極限統帥", aiCharIdx: 1, sims: 2050, c: 1.08, cornerW: 1.55, mobW: 1.55, xPen: 1.60, humanBlack: true, desc: "第 9 關：統帥小璃玖，逾兩千步模擬的嚴密包圍網。" },
  { stage: 10, title: "終焉琉璃・星海宗師", aiCharIdx: 4, sims: 2500, c: 1.15, cornerW: 1.65, mobW: 1.60, xPen: 1.65, humanBlack: false, desc: "最終第 10 關：星海宗師小星璃執黑，2500次深度模擬終極對決！" }
];
