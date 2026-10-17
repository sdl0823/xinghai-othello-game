// js/storage_manager.js - 單機版紀錄檔、選角設定與對弈時間記錄器模組
const STORAGE_KEY = "othello_mcts_standalone_save_v3";

function formatDurationMMSS(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function formatDurationPrecise(ms) {
  const totalSec = Math.max(0, ms / 1000);
  if (totalSec < 60) {
    return totalSec.toFixed(1) + "s";
  }
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1).padStart(4, "0");
  return `${String(m).padStart(2, "0")}:${s}`;
}

class StorageManager {
  constructor() {
    this.data = this.loadLocal();
  }

  getDefaultData() {
    return {
      version: "2.0",
      saveTime: new Date().toISOString(),
      currentStage: 1,
      selectedHumanCharIdx: 1, // 預設玩家角色：小璃玖
      unlockedStages: [1],     // 預設只有第 1 關解鎖！第 2~10 關必須獲勝才能開啟
      clearedStages: [],
      stats: {
        humanWins: 0,
        aiWins: 0,
        draws: 0
      },
      stageHighScores: {},
      stageBestTimesSec: {},   // 各關最快通關秒數
      matchTimeHistory: [],    // 歷史每局對弈時間與戰績記錄表
      savedGame: null
    };
  }

  loadLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("othello_mcts_standalone_save_v2");
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = this.getDefaultData();
        return {
          ...def,
          ...parsed,
          stats: { ...def.stats, ...(parsed.stats || {}) },
          unlockedStages: Array.isArray(parsed.unlockedStages) ? parsed.unlockedStages : [1],
          clearedStages: Array.isArray(parsed.clearedStages) ? parsed.clearedStages : [],
          stageHighScores: parsed.stageHighScores || {},
          stageBestTimesSec: parsed.stageBestTimesSec || {},
          matchTimeHistory: Array.isArray(parsed.matchTimeHistory) ? parsed.matchTimeHistory : []
        };
      }
    } catch (e) {}
    return this.getDefaultData();
  }

  saveLocal() {
    try {
      this.data.saveTime = new Date().toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {}
  }

  setSelectedHumanChar(charIdx) {
    this.data.selectedHumanCharIdx = charIdx;
    this.saveLocal();
  }

  isStageUnlocked(stageNum) {
    return this.data.unlockedStages.includes(stageNum);
  }

  // 紀錄對局完賽時間與戰果
  recordMatchTimeEntry(entry) {
    // entry: { stageNum, humanCharName, aiCharName, resultText, humanScore, aiScore, totalSec, humanMs, aiMs, movesCount }
    const record = {
      timestamp: new Date().toLocaleString("zh-TW", { hour12: false }),
      ...entry
    };
    this.data.matchTimeHistory.unshift(record);
    if (this.data.matchTimeHistory.length > 50) {
      this.data.matchTimeHistory.length = 50;
    }
    this.saveLocal();
  }

  clearMatchTimeHistory() {
    this.data.matchTimeHistory = [];
    this.saveLocal();
  }

  recordStageWin(stageNum, humanScore, aiScore, durationSec = null) {
    if (!this.data.clearedStages.includes(stageNum)) {
      this.data.clearedStages.push(stageNum);
    }
    const nextStage = stageNum + 1;
    if (nextStage <= 10 && !this.data.unlockedStages.includes(nextStage)) {
      this.data.unlockedStages.push(nextStage);
    }
    this.data.stats.humanWins += 1;

    const prevBest = this.data.stageHighScores[stageNum] || 0;
    if (humanScore > prevBest) {
      this.data.stageHighScores[stageNum] = humanScore;
    }

    if (typeof durationSec === "number" && durationSec > 0) {
      const prevBestTime = this.data.stageBestTimesSec[stageNum];
      if (!prevBestTime || durationSec < prevBestTime) {
        this.data.stageBestTimesSec[stageNum] = Math.round(durationSec);
      }
    }

    this.saveLocal();
    return nextStage <= 10 ? nextStage : null;
  }

  recordStageDefeat(stageNum) {
    this.data.stats.aiWins += 1;
    this.saveLocal();
  }

  recordStageDraw(stageNum) {
    this.data.stats.draws += 1;
    this.saveLocal();
  }

  saveCurrentGame(snapshot) {
    this.data.savedGame = {
      timestamp: new Date().toISOString(),
      stageNum: snapshot.stageNum,
      board: snapshot.board,
      currentPlayer: snapshot.currentPlayer,
      humanColor: snapshot.humanColor,
      moveHistory: snapshot.moveHistory,
      humanCharIdx: snapshot.humanCharIdx,
      aiCharIdx: snapshot.aiCharIdx,
      elapsedTotalMs: snapshot.elapsedTotalMs || 0,
      humanSpentMs: snapshot.humanSpentMs || 0,
      aiSpentMs: snapshot.aiSpentMs || 0
    };
    this.saveLocal();
  }

  hasSavedGame() {
    return !!this.data.savedGame;
  }

  getSavedGame() {
    return this.data.savedGame;
  }

  clearSavedGame() {
    this.data.savedGame = null;
    this.saveLocal();
  }

  exportSaveFile() {
    this.data.saveTime = new Date().toISOString();
    const str = JSON.stringify(this.data, null, 2);
    const blob = new Blob([str], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `othello_mcts_save_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importSaveFile(jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed.unlockedStages)) {
        const def = this.getDefaultData();
        this.data = {
          ...def,
          ...parsed,
          stats: { ...def.stats, ...(parsed.stats || {}) },
          stageBestTimesSec: parsed.stageBestTimesSec || {},
          matchTimeHistory: Array.isArray(parsed.matchTimeHistory) ? parsed.matchTimeHistory : []
        };
        this.saveLocal();
        return true;
      }
    } catch (e) {}
    return false;
  }

  resetAllProgress() {
    this.data = this.getDefaultData();
    this.saveLocal();
  }
}

const storageMgr = new StorageManager();
