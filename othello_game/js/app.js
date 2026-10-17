// js/app.js - 遊戲主介面控制器 (純棋盤沉浸設計 + 選角畫面 + 對弈時間記錄器 + 關卡鎖定 + 存檔系統)
const gameState = {
  currentStageIdx: 0,
  board: createInitialBoard(),
  currentPlayer: BLACK,
  humanColor: BLACK,
  aiCharIdx: STAGES[0].aiCharIdx,
  humanCharIdx: storageMgr.data.selectedHumanCharIdx ?? 1, // 預設玩家角色：小璃玖
  customHumanAvatarUrl: null,
  moveHistory: [],
  undoStack: [],
  lastMove: null,
  lastMCTSResult: null,
  reusableTreeRoot: null,
  isThinking: false,
  aiVsAiActive: false,
  aiTimerId: null,
  prevAiWinRate: 0.5,
  dynamicC: STAGES[0].c,
  dynamicSims: STAGES[0].sims,
  dynamicWeights: {
    cornerMultiplier: STAGES[0].cornerW,
    mobilityMultiplier: STAGES[0].mobW,
    xPenaltyMultiplier: STAGES[0].xPen
  },
  // 對弈時間記錄器狀態
  timerRunning: false,
  timerPaused: false,
  gameOver: false,
  clockIntervalId: null,
  lastTickPerf: 0,
  elapsedTotalMs: 0,
  humanSpentMs: 0,
  aiSpentMs: 0,
  currentStepMs: 0
};

// 選角畫面暫存狀態
const charModalTemp = {
  humanCharIdx: 1,
  aiCharIdx: 3,
  humanColor: BLACK
};

function getHumanAvatarSrc() {
  if (gameState.customHumanAvatarUrl) return gameState.customHumanAvatarUrl;
  return getCharImgSrc(CHARACTERS[gameState.humanCharIdx]);
}

function showToast(msg) {
  const t = document.getElementById("toastMsg");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ============================================================================
// 對弈時間記錄器 (Match Clock & Time Recorder)
// ============================================================================
function startMatchClock(reset = true) {
  if (reset) {
    gameState.elapsedTotalMs = 0;
    gameState.humanSpentMs = 0;
    gameState.aiSpentMs = 0;
    gameState.currentStepMs = 0;
  }
  gameState.timerRunning = true;
  gameState.timerPaused = false;
  gameState.gameOver = false;
  gameState.lastTickPerf = performance.now();

  const pauseBtn = document.getElementById("pauseTimerBtn");
  if (pauseBtn) pauseBtn.textContent = "⏸";

  if (gameState.clockIntervalId) clearInterval(gameState.clockIntervalId);
  gameState.clockIntervalId = setInterval(() => {
    if (!gameState.timerRunning || gameState.timerPaused || gameState.gameOver) {
      gameState.lastTickPerf = performance.now();
      return;
    }
    const now = performance.now();
    const dt = Math.max(0, now - gameState.lastTickPerf);
    gameState.lastTickPerf = now;

    gameState.elapsedTotalMs += dt;
    gameState.currentStepMs += dt;

    if (gameState.currentPlayer === gameState.humanColor && !gameState.aiVsAiActive) {
      gameState.humanSpentMs += dt;
    } else {
      gameState.aiSpentMs += dt;
    }

    updateClockUI();
  }, 100);

  updateClockUI();
}

function stopMatchClock() {
  gameState.timerRunning = false;
  if (gameState.clockIntervalId) {
    clearInterval(gameState.clockIntervalId);
    gameState.clockIntervalId = null;
  }
  updateClockUI();
}

function togglePauseMatchClock() {
  if (gameState.gameOver) return;
  gameState.timerPaused = !gameState.timerPaused;
  gameState.lastTickPerf = performance.now();
  const pauseBtn = document.getElementById("pauseTimerBtn");
  if (pauseBtn) {
    pauseBtn.textContent = gameState.timerPaused ? "▶" : "⏸";
  }
  showToast(gameState.timerPaused ? "⏸ 對弈計時已暫停" : "▶ 對弈計時繼續");
  updateClockUI();
}

function updateClockUI() {
  const totalSec = Math.floor(gameState.elapsedTotalMs / 1000);
  const totalStr = formatDurationMMSS(totalSec);

  const matchTotalEl = document.getElementById("matchTotalTimer");
  if (matchTotalEl) matchTotalEl.textContent = totalStr;

  const stepSec = (gameState.currentStepMs / 1000).toFixed(1);
  const stepEl = document.getElementById("currentStepTimer");
  if (stepEl) {
    stepEl.textContent = `本手 ${stepSec}s｜第 ${gameState.moveHistory.length + 1} 手`;
  }

  const isHumanBlack = gameState.humanColor === BLACK;
  const blackMs = isHumanBlack ? gameState.humanSpentMs : gameState.aiSpentMs;
  const whiteMs = !isHumanBlack ? gameState.humanSpentMs : gameState.aiSpentMs;

  const blackTimerEl = document.getElementById("blackTimerText");
  const whiteTimerEl = document.getElementById("whiteTimerText");
  if (blackTimerEl) blackTimerEl.textContent = `⏱️ 用時 ${formatDurationPrecise(blackMs)}`;
  if (whiteTimerEl) whiteTimerEl.textContent = `⏱️ 用時 ${formatDurationPrecise(whiteMs)}`;

  // 若時間記錄器彈窗開啟中，同步更新彈窗上方數字
  const timeModal = document.getElementById("timeLogModal");
  if (timeModal && timeModal.classList.contains("open")) {
    document.getElementById("modalTotalTime").textContent = totalStr;
    document.getElementById("modalHumanTime").textContent = formatDurationPrecise(gameState.humanSpentMs);
    document.getElementById("modalAiTime").textContent = formatDurationPrecise(gameState.aiSpentMs);
    document.getElementById("modalMoveCount").textContent = `${gameState.moveHistory.length} 手`;
  }
}

// ============================================================================
// 關卡選單與計分板更新
// ============================================================================
function updateStageButtons() {
  const container = document.getElementById("stageTrackScroll");
  if (!container) return;
  container.innerHTML = "";

  STAGES.forEach((st, idx) => {
    const isUnlocked = storageMgr.isStageUnlocked(st.stage);
    const isCleared = storageMgr.data.clearedStages.includes(st.stage);
    const isActive = idx === gameState.currentStageIdx;
    const ch = CHARACTERS[st.aiCharIdx];
    const bestSec = storageMgr.data.stageBestTimesSec[st.stage];

    const btn = document.createElement("div");
    btn.className = "stage-btn" +
      (isActive ? " active-stage" : "") +
      (isCleared ? " cleared" : "") +
      (!isUnlocked ? " locked" : "");

    btn.innerHTML = `
      <img class="stage-btn-avatar" src="${getCharImgSrc(ch)}" alt="${ch.name}">
      <span class="stage-btn-num">第${st.stage}關</span>
      ${bestSec ? `<span class="stage-btn-time">⏱${formatDurationMMSS(bestSec)}</span>` : ""}
      <span class="stage-btn-icon">${!isUnlocked ? "🔒" : (isCleared ? "★" : "")}</span>
    `;

    btn.addEventListener("click", () => {
      if (!isUnlocked) {
        showToast(`🔒 第 ${st.stage} 關尚未開啟！必須在第 ${st.stage - 1} 關獲勝才能解鎖！`);
        return;
      }
      selectStage(idx);
    });

    container.appendChild(btn);
  });

  const curr = STAGES[gameState.currentStageIdx];
  const ai = CHARACTERS[gameState.aiCharIdx];
  const hu = CHARACTERS[gameState.humanCharIdx];
  const bestCurrSec = storageMgr.data.stageBestTimesSec[curr.stage];

  const titleEl = document.getElementById("currentStageTitleText");
  if (titleEl) {
    titleEl.textContent = `第 ${curr.stage} 關：${curr.title}（你的角色：${hu.name} VS 守關AI：${ai.name}）`;
  }

  const hintEl = document.getElementById("stageBestTimeHint");
  if (hintEl) {
    hintEl.textContent = bestCurrSec
      ? `🏆 本關最快通關紀錄：${formatDurationMMSS(bestCurrSec)}｜點擊頭像可隨時換角`
      : `🔒 獲勝解鎖下一關｜點擊上方「🎭 選角畫面」或雙方頭像可更換角色`;
  }
}

function selectStage(stageIdx) {
  const st = STAGES[stageIdx];
  if (!storageMgr.isStageUnlocked(st.stage)) {
    showToast(`🔒 第 ${st.stage} 關尚未解鎖！必須獲勝才能解鎖！`);
    return;
  }

  gameState.currentStageIdx = stageIdx;
  gameState.aiCharIdx = st.aiCharIdx;
  gameState.humanColor = st.humanBlack ? BLACK : WHITE;

  gameState.dynamicSims = st.sims;
  gameState.dynamicC = st.c;
  gameState.dynamicWeights = {
    cornerMultiplier: st.cornerW,
    mobilityMultiplier: st.mobW,
    xPenaltyMultiplier: st.xPen
  };

  const swapBtn = document.getElementById("swapColorBtn");
  if (swapBtn) {
    swapBtn.textContent = gameState.humanColor === BLACK ? "⚫ 玩家執黑先手" : "⚪ 玩家執白後手";
  }

  audioMgr.playStageBGM(st.stage);
  startNewGame();
}

function updateScoreboard() {
  const counts = countDiscs(gameState.board);
  const isHumanBlack = gameState.humanColor === BLACK;
  const huChar = CHARACTERS[gameState.humanCharIdx];
  const aiChar = CHARACTERS[gameState.aiCharIdx];

  document.getElementById("blackScore").textContent = counts.black;
  document.getElementById("whiteScore").textContent = counts.white;

  const blackRing = document.getElementById("blackRing");
  const whiteRing = document.getElementById("whiteRing");
  if (blackRing) {
    blackRing.className = "player-ring " + (isHumanBlack ? "human-ring" : "ai-ring");
  }
  if (whiteRing) {
    whiteRing.className = "player-ring " + (!isHumanBlack ? "human-ring" : "ai-ring");
  }

  document.getElementById("blackAvatar").src = isHumanBlack ? getHumanAvatarSrc() : getCharImgSrc(aiChar);
  document.getElementById("blackName").textContent = isHumanBlack ? `${huChar.name} (你・黑子)` : `${aiChar.name} (AI・黑子)`;

  document.getElementById("whiteAvatar").src = !isHumanBlack ? getHumanAvatarSrc() : getCharImgSrc(aiChar);
  document.getElementById("whiteName").textContent = !isHumanBlack ? `${huChar.name} (你・白子)` : `${aiChar.name} (AI・白子)`;

  document.getElementById("blackPlayerCard").classList.toggle("active-turn", gameState.currentPlayer === BLACK);
  document.getElementById("whitePlayerCard").classList.toggle("active-turn", gameState.currentPlayer === WHITE);

  const turnEl = document.getElementById("turnIndicator");
  if (gameState.isThinking) {
    turnEl.textContent = "AI 深度推演中...";
  } else if (gameState.gameOver) {
    turnEl.textContent = "對局已結束";
  } else {
    turnEl.textContent = gameState.currentPlayer === gameState.humanColor ? "輪到你落子" : "守關 AI 回合";
  }
}

// ============================================================================
// 棋盤渲染 (角色頭像棋子)
// ============================================================================
function renderBoard() {
  const boardEl = document.getElementById("boardGrid");
  boardEl.innerHTML = "";

  const legalMoves = getLegalMoves(gameState.board, gameState.currentPlayer);
  const legalMap = new Map();
  legalMoves.forEach(m => legalMap.set(`${m.r},${m.c}`, m));

  const flippedSet = new Set();
  if (gameState.lastMove && gameState.lastMove.flips) {
    gameState.lastMove.flips.forEach(([fr, fc]) => flippedSet.add(`${fr},${fc}`));
  }

  const huChar = CHARACTERS[gameState.humanCharIdx];
  const aiChar = CHARACTERS[gameState.aiCharIdx];
  const currentTurnAvatarSrc = gameState.currentPlayer === gameState.humanColor
    ? getHumanAvatarSrc()
    : getCharImgSrc(aiChar);

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      if ((r === 2 || r === 6) && (c === 2 || c === 6)) {
        cell.classList.add("star-dot");
      }

      const key = `${r},${c}`;
      const val = gameState.board[r][c];

      if (val !== EMPTY) {
        const isHumanDisc = (val === gameState.humanColor);
        const discChar = isHumanDisc ? huChar : aiChar;

        const disc = document.createElement("div");
        disc.className = "disc " + (isHumanDisc ? "human-owned" : "ai-owned");
        if (flippedSet.has(key)) {
          disc.classList.add("flip-anim");
        }

        const avatarImg = document.createElement("img");
        avatarImg.className = "disc-avatar";
        avatarImg.src = isHumanDisc ? getHumanAvatarSrc() : getCharImgSrc(aiChar);
        avatarImg.alt = discChar.name;
        disc.appendChild(avatarImg);

        const pip = document.createElement("span");
        pip.className = "disc-pip " + (val === BLACK ? "black-pip" : "white-pip");
        disc.appendChild(pip);

        cell.appendChild(disc);

        if (gameState.lastMove && gameState.lastMove.r === r && gameState.lastMove.c === c) {
          const marker = document.createElement("div");
          marker.className = "last-move-marker";
          cell.appendChild(marker);
        }
      } else {
        const legalMove = legalMap.get(key);
        if (legalMove && (gameState.currentPlayer === gameState.humanColor || !gameState.aiVsAiActive)) {
          const hint = document.createElement("div");
          hint.className = "legal-hint-circle";
          hint.innerHTML = `<img src="${currentTurnAvatarSrc}" alt="hint">`;
          cell.appendChild(hint);
        }

        if (legalMove && !gameState.isThinking && gameState.currentPlayer === gameState.humanColor && !gameState.aiVsAiActive) {
          cell.addEventListener("click", () => handleHumanMove(legalMove));
        }
      }

      boardEl.appendChild(cell);
    }
  }
}

// ============================================================================
// 落子與對局流程
// ============================================================================
function handleHumanMove(move) {
  if (gameState.isThinking || gameState.gameOver) return;
  if (gameState.timerPaused) {
    gameState.timerPaused = false;
    const pauseBtn = document.getElementById("pauseTimerBtn");
    if (pauseBtn) pauseBtn.textContent = "⏸";
  }

  gameState.undoStack.push({
    board: cloneBoard(gameState.board),
    currentPlayer: gameState.currentPlayer,
    lastMove: gameState.lastMove,
    moveHistory: gameState.moveHistory.slice(),
    prevAiWinRate: gameState.prevAiWinRate,
    elapsedTotalMs: gameState.elapsedTotalMs,
    humanSpentMs: gameState.humanSpentMs,
    aiSpentMs: gameState.aiSpentMs
  });
  document.getElementById("undoBtn").disabled = false;

  executeMove(move, gameState.currentPlayer);
}

function executeMove(move, player) {
  const isCorner = (move.r === 0 || move.r === 7) && (move.c === 0 || move.c === 7);
  audioMgr.playMove(isCorner);

  const stepSpentMs = Math.max(50, gameState.currentStepMs);
  gameState.currentStepMs = 0;

  const isHuman = (player === gameState.humanColor);
  const charObj = isHuman ? CHARACTERS[gameState.humanCharIdx] : CHARACTERS[gameState.aiCharIdx];

  gameState.board = applyMove(gameState.board, move, player);
  gameState.lastMove = move;
  gameState.moveHistory.push({
    moveNum: gameState.moveHistory.length + 1,
    player,
    isHuman,
    charName: charObj.name,
    notation: coordToNotation(move.r, move.c),
    flipsCount: move.flips.length,
    stepMs: Math.round(stepSpentMs),
    totalSec: Math.floor(gameState.elapsedTotalMs / 1000)
  });

  const nextPlayer = -player;
  const nextLegal = getLegalMoves(gameState.board, nextPlayer);

  if (nextLegal.length > 0) {
    gameState.currentPlayer = nextPlayer;
  } else {
    const sameLegal = getLegalMoves(gameState.board, player);
    if (sameLegal.length > 0) {
      showToast(`${nextPlayer === BLACK ? "黑方" : "白方"}無合法步，自動 PASS！`);
      gameState.currentPlayer = player;
    } else {
      updateScoreboard();
      renderBoard();
      handleGameOver();
      return;
    }
  }

  updateScoreboard();
  updateClockUI();
  renderBoard();

  if (gameState.aiVsAiActive || gameState.currentPlayer !== gameState.humanColor) {
    gameState.isThinking = true;
    updateScoreboard();
    clearTimeout(gameState.aiTimerId);
    gameState.aiTimerId = setTimeout(() => triggerAIMove(), 80);
  }
}

function triggerAIMove() {
  const aiStartPerf = performance.now();
  const aiPlayer = gameState.currentPlayer;
  const mctsRes = runMCTSSearch(
    gameState.board,
    aiPlayer,
    {
      simulations: gameState.dynamicSims,
      explorationC: gameState.dynamicC,
      smartRollout: true,
      dynamicWeights: gameState.dynamicWeights
    },
    gameState.reusableTreeRoot
  );

  const aiElapsed = Math.max(20, performance.now() - aiStartPerf);
  gameState.aiSpentMs += aiElapsed;
  gameState.elapsedTotalMs += aiElapsed;
  gameState.currentStepMs += aiElapsed;
  gameState.lastTickPerf = performance.now();

  gameState.isThinking = false;
  gameState.lastMCTSResult = mctsRes;

  if (!mctsRes.bestMove) {
    handleGameOver();
    return;
  }

  gameState.reusableTreeRoot = mctsRes.bestCandidate ? mctsRes.bestCandidate.node : null;
  executeMove(mctsRes.bestMove, aiPlayer);
}

function handleGameOver() {
  clearTimeout(gameState.aiTimerId);
  gameState.gameOver = true;
  stopMatchClock();

  const { black, white } = countDiscs(gameState.board);
  const aiColor = -gameState.humanColor;
  const huScore = gameState.humanColor === BLACK ? black : white;
  const aiScore = aiColor === BLACK ? black : white;

  const curr = STAGES[gameState.currentStageIdx];
  const huChar = CHARACTERS[gameState.humanCharIdx];
  const aiChar = CHARACTERS[gameState.aiCharIdx];
  const totalSec = Math.max(1, Math.round(gameState.elapsedTotalMs / 1000));
  const timeFormatted = formatDurationMMSS(totalSec);

  const banner = document.getElementById("stageBanner");
  const bannerTitle = document.getElementById("bannerTitle");
  const bannerSub = document.getElementById("bannerSub");
  const nextBtn = document.getElementById("nextStageBtn");

  let resultLabel = "平手";

  if (huScore > aiScore) {
    resultLabel = "獲勝";
    audioMgr.playStageClear();
    const unlockedNext = storageMgr.recordStageWin(curr.stage, huScore, aiScore, totalSec);
    banner.className = "stage-banner show";
    bannerTitle.textContent = `★ 第 ${curr.stage} 關通關勝利！(${huScore} : ${aiScore}｜耗時 ${timeFormatted})`;

    if (unlockedNext) {
      bannerSub.textContent = `恭喜解鎖第 ${unlockedNext} 關「${STAGES[unlockedNext - 1].title}」！對弈時間已記錄。`;
      nextBtn.style.display = "inline-flex";
      audioMgr.playUnlock();
    } else {
      bannerSub.textContent = `👑 恭喜你全破 10 大星海關卡，登頂棋聖！總耗時 ${timeFormatted}`;
      nextBtn.style.display = "none";
    }
  } else if (aiScore > huScore) {
    resultLabel = "失利";
    audioMgr.playDefeat();
    storageMgr.recordStageDefeat(curr.stage);
    banner.className = "stage-banner defeat show";
    bannerTitle.textContent = `第 ${curr.stage} 關挑戰未果 (${huScore} : ${aiScore}｜耗時 ${timeFormatted})`;
    bannerSub.textContent = `未能獲勝，下一關尚未開啟。可調整選角或使用提示重新挑戰！`;
    nextBtn.style.display = "none";
  } else {
    storageMgr.recordStageDraw(curr.stage);
    banner.className = "stage-banner show";
    bannerTitle.textContent = `雙方平手 (${huScore} : ${aiScore}｜耗時 ${timeFormatted})`;
    bannerSub.textContent = `勢均力敵！必須獲勝才能解鎖下一關！`;
    nextBtn.style.display = "none";
  }

  // 寫入對弈時間歷史記錄器
  storageMgr.recordMatchTimeEntry({
    stageNum: curr.stage,
    humanCharName: huChar.name,
    aiCharName: aiChar.name,
    resultText: `${resultLabel} (${huScore}:${aiScore})`,
    humanScore: huScore,
    aiScore: aiScore,
    totalSec,
    humanMs: Math.round(gameState.humanSpentMs),
    aiMs: Math.round(gameState.aiSpentMs),
    movesCount: gameState.moveHistory.length
  });

  updateStageButtons();
  updateScoreboard();
}

function startNewGame() {
  clearTimeout(gameState.aiTimerId);
  if (gameState.aiVsAiActive) {
    gameState.aiVsAiActive = false;
    document.getElementById("aiVsAiBtn").textContent = "🤖 AI 自動對決";
  }

  document.getElementById("stageBanner").className = "stage-banner";
  gameState.board = createInitialBoard();
  gameState.currentPlayer = BLACK;
  gameState.moveHistory = [];
  gameState.undoStack = [];
  gameState.lastMove = null;
  gameState.lastMCTSResult = null;
  gameState.reusableTreeRoot = null;
  gameState.isThinking = false;
  gameState.gameOver = false;

  document.getElementById("undoBtn").disabled = true;
  startMatchClock(true);
  updateStageButtons();
  updateScoreboard();
  renderBoard();

  if (gameState.humanColor === WHITE) {
    gameState.isThinking = true;
    updateScoreboard();
    gameState.aiTimerId = setTimeout(() => triggerAIMove(), 100);
  }
}

// ============================================================================
// 1. 選角畫面彈窗 (Character Selection Screen Modal)
// ============================================================================
function openCharSelectModal() {
  charModalTemp.humanCharIdx = gameState.humanCharIdx;
  charModalTemp.aiCharIdx = gameState.aiCharIdx;
  charModalTemp.humanColor = gameState.humanColor;

  renderCharSelectModalGrids();
  document.getElementById("charSelectModal").classList.add("open");
}

function closeCharSelectModal() {
  document.getElementById("charSelectModal").classList.remove("open");
}

function renderCharSelectModalGrids() {
  const humanGrid = document.getElementById("humanCharGrid");
  const aiGrid = document.getElementById("aiCharGrid");
  if (!humanGrid || !aiGrid) return;

  humanGrid.innerHTML = "";
  aiGrid.innerHTML = "";

  const selHu = CHARACTERS[charModalTemp.humanCharIdx];
  const selAi = CHARACTERS[charModalTemp.aiCharIdx];

  document.getElementById("selectedHumanCharBadge").textContent = `目前選擇：${selHu.name}`;
  document.getElementById("selectedAiCharBadge").textContent = `目前對手：${selAi.name}`;

  document.getElementById("previewHumanImg").src = gameState.customHumanAvatarUrl || getCharImgSrc(selHu);
  document.getElementById("previewHumanName").textContent = `${selHu.name}・${selHu.title}`;
  document.getElementById("previewHumanDesc").textContent = selHu.desc;

  CHARACTERS.forEach((ch, idx) => {
    // 玩家角色卡
    const hCard = document.createElement("div");
    hCard.className = "char-select-card" + (idx === charModalTemp.humanCharIdx ? " selected-human" : "");
    hCard.innerHTML = `
      <img src="${getCharImgSrc(ch)}" alt="${ch.name}">
      <div class="c-name">${ch.name}</div>
      <div class="c-tag">${ch.title.split("・")[0]}</div>
    `;
    hCard.addEventListener("click", () => {
      charModalTemp.humanCharIdx = idx;
      gameState.customHumanAvatarUrl = null;
      renderCharSelectModalGrids();
    });
    humanGrid.appendChild(hCard);

    // AI 對手角色卡
    const aCard = document.createElement("div");
    aCard.className = "char-select-card" + (idx === charModalTemp.aiCharIdx ? " selected-ai" : "");
    aCard.innerHTML = `
      <img src="${getCharImgSrc(ch)}" alt="${ch.name}">
      <div class="c-name">${ch.name}</div>
      <div class="c-tag">${ch.title.split("・")[0]}</div>
    `;
    aCard.addEventListener("click", () => {
      charModalTemp.aiCharIdx = idx;
      renderCharSelectModalGrids();
    });
    aiGrid.appendChild(aCard);
  });

  const blackBtn = document.getElementById("modalPickBlackBtn");
  const whiteBtn = document.getElementById("modalPickWhiteBtn");
  if (blackBtn && whiteBtn) {
    blackBtn.classList.toggle("cyan", charModalTemp.humanColor === BLACK);
    whiteBtn.classList.toggle("cyan", charModalTemp.humanColor === WHITE);
  }
}

// ============================================================================
// 2. 對弈時間記錄器彈窗 (Match Time & Move Log Modal)
// ============================================================================
function openTimeLogModal() {
  const m = document.getElementById("timeLogModal");
  m.classList.add("open");
  updateClockUI();
  renderMoveTimeTable();
  renderMatchHistoryTable();
}

function closeTimeLogModal() {
  document.getElementById("timeLogModal").classList.remove("open");
}

function renderMoveTimeTable() {
  const tbody = document.getElementById("moveTimeTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (gameState.moveHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:10px;">本局尚無落子紀錄</td></tr>`;
    return;
  }

  gameState.moveHistory.slice().reverse().forEach(item => {
    const tr = document.createElement("tr");
    const roleBadge = item.isHuman
      ? `<span style="color:var(--accent-cyan);font-weight:700;">${item.charName} (你)</span>`
      : `<span style="color:var(--accent-gold);font-weight:700;">${item.charName} (AI)</span>`;
    tr.innerHTML = `
      <td>第 ${item.moveNum} 手</td>
      <td>${roleBadge}</td>
      <td><strong>${item.notation}</strong></td>
      <td>+${item.flipsCount} 顆</td>
      <td>${formatDurationPrecise(item.stepMs)}</td>
      <td>${formatDurationMMSS(item.totalSec)}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderMatchHistoryTable() {
  const tbody = document.getElementById("matchHistoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const history = storageMgr.data.matchTimeHistory || [];
  if (history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:10px;">尚無完賽歷史紀錄，完成一局對弈後將自動記錄！</td></tr>`;
    return;
  }

  history.forEach(rec => {
    const tr = document.createElement("tr");
    const isWin = rec.resultText && rec.resultText.startsWith("獲勝");
    const resColor = isWin ? "var(--accent-emerald)" : (rec.resultText.startsWith("失利") ? "var(--accent-rose)" : "var(--accent-gold)");
    tr.innerHTML = `
      <td>${rec.timestamp}</td>
      <td>第 ${rec.stageNum} 關</td>
      <td>${rec.humanCharName} vs ${rec.aiCharName}</td>
      <td style="color:${resColor};font-weight:700;">${rec.resultText}</td>
      <td><strong>${formatDurationMMSS(rec.totalSec)}</strong> (${rec.movesCount}手)</td>
      <td>你 ${formatDurationPrecise(rec.humanMs)} / AI ${formatDurationPrecise(rec.aiMs)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================================
// 3. 存檔與設計師彈窗
// ============================================================================
function openSaveModal() {
  const m = document.getElementById("saveModal");
  m.classList.add("open");
  document.getElementById("statWins").textContent = storageMgr.data.stats.humanWins;
  document.getElementById("statLosses").textContent = storageMgr.data.stats.aiWins;
  const drawsEl = document.getElementById("statDraws");
  if (drawsEl) drawsEl.textContent = storageMgr.data.stats.draws;
  document.getElementById("statCleared").textContent = `${storageMgr.data.clearedStages.length} / 10`;

  const hasSave = storageMgr.hasSavedGame();
  document.getElementById("loadGameBtn").disabled = !hasSave;
}

function closeSaveModal() {
  document.getElementById("saveModal").classList.remove("open");
}

function openDevModal() {
  document.getElementById("devModal").classList.add("open");
}

function closeDevModal() {
  document.getElementById("devModal").classList.remove("open");
}

// ============================================================================
// 事件綁定與初始化
// ============================================================================
function initEvents() {
  const bgmBtn = document.getElementById("bgmToggleBtn");
  audioMgr.onStatusChange((statusText, isPlaying) => {
    if (!bgmBtn) return;
    bgmBtn.textContent = statusText;
    bgmBtn.classList.toggle("emerald", isPlaying);
  });

  if (bgmBtn) {
    bgmBtn.addEventListener("click", () => {
      audioMgr.toggleBGM();
    });
  }

  const customBgmInput = document.getElementById("customBgmFileInput");
  if (customBgmInput) {
    customBgmInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const stNum = STAGES[gameState.currentStageIdx].stage;
      audioMgr.setCustomStageAudioFile(stNum, file);
      showToast(`🎵 已載入並播放第 ${stNum} 關音樂：${file.name}`);
      closeDevModal();
    });
  }

  // 選角畫面綁定 (頂部按鈕、底部按鈕、點擊計分板雙方頭像卡片)
  document.getElementById("openCharSelectBtn").addEventListener("click", openCharSelectModal);
  document.getElementById("bottomCharSelectBtn").addEventListener("click", openCharSelectModal);
  document.getElementById("blackPlayerCard").addEventListener("click", openCharSelectModal);
  document.getElementById("whitePlayerCard").addEventListener("click", openCharSelectModal);
  document.getElementById("closeCharModalBtn").addEventListener("click", closeCharSelectModal);

  document.getElementById("modalPickBlackBtn").addEventListener("click", () => {
    charModalTemp.humanColor = BLACK;
    renderCharSelectModalGrids();
  });

  document.getElementById("modalPickWhiteBtn").addEventListener("click", () => {
    charModalTemp.humanColor = WHITE;
    renderCharSelectModalGrids();
  });

  document.getElementById("customAvatarInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (gameState.customHumanAvatarUrl) URL.revokeObjectURL(gameState.customHumanAvatarUrl);
    gameState.customHumanAvatarUrl = URL.createObjectURL(file);
    document.getElementById("previewHumanImg").src = gameState.customHumanAvatarUrl;
    showToast(`🖼️ 已載入自訂頭像圖片：${file.name}`);
  });

  document.getElementById("applyCharKeepGameBtn").addEventListener("click", () => {
    gameState.humanCharIdx = charModalTemp.humanCharIdx;
    gameState.aiCharIdx = charModalTemp.aiCharIdx;
    storageMgr.setSelectedHumanChar(gameState.humanCharIdx);
    updateStageButtons();
    updateScoreboard();
    renderBoard();
    closeCharSelectModal();
    showToast(`🎭 已更換角色為：${CHARACTERS[gameState.humanCharIdx].name} VS ${CHARACTERS[gameState.aiCharIdx].name}`);
  });

  document.getElementById("applyCharNewGameBtn").addEventListener("click", () => {
    gameState.humanCharIdx = charModalTemp.humanCharIdx;
    gameState.aiCharIdx = charModalTemp.aiCharIdx;
    gameState.humanColor = charModalTemp.humanColor;
    storageMgr.setSelectedHumanChar(gameState.humanCharIdx);
    document.getElementById("swapColorBtn").textContent = gameState.humanColor === BLACK ? "⚫ 玩家執黑先手" : "⚪ 玩家執白後手";
    closeCharSelectModal();
    startNewGame();
    showToast(`🎭 已以「${CHARACTERS[gameState.humanCharIdx].name}」展開新對局！`);
  });

  // 對弈時間記錄器綁定
  document.getElementById("openTimeLogBtn").addEventListener("click", openTimeLogModal);
  document.getElementById("closeTimeLogModalBtn").addEventListener("click", closeTimeLogModal);
  document.getElementById("pauseTimerBtn").addEventListener("click", togglePauseMatchClock);

  document.getElementById("clearTimeHistoryBtn").addEventListener("click", () => {
    storageMgr.clearMatchTimeHistory();
    renderMatchHistoryTable();
    showToast("⏱️ 已清空歷史對弈時間紀錄");
  });

  // 對局操作按鈕
  document.getElementById("newGameBtn").addEventListener("click", () => startNewGame());
  document.getElementById("retryBtn").addEventListener("click", () => startNewGame());
  document.getElementById("nextStageBtn").addEventListener("click", () => {
    if (gameState.currentStageIdx < STAGES.length - 1) {
      selectStage(gameState.currentStageIdx + 1);
    }
  });

  document.getElementById("swapColorBtn").addEventListener("click", () => {
    gameState.humanColor = -gameState.humanColor;
    document.getElementById("swapColorBtn").textContent = gameState.humanColor === BLACK ? "⚫ 玩家執黑先手" : "⚪ 玩家執白後手";
    startNewGame();
  });

  document.getElementById("undoBtn").addEventListener("click", () => {
    if (gameState.isThinking || gameState.undoStack.length === 0) return;
    clearTimeout(gameState.aiTimerId);
    const snap = gameState.undoStack.pop();
    gameState.board = snap.board;
    gameState.currentPlayer = snap.currentPlayer;
    gameState.lastMove = snap.lastMove;
    gameState.moveHistory = snap.moveHistory;
    gameState.elapsedTotalMs = snap.elapsedTotalMs ?? gameState.elapsedTotalMs;
    gameState.humanSpentMs = snap.humanSpentMs ?? gameState.humanSpentMs;
    gameState.aiSpentMs = snap.aiSpentMs ?? gameState.aiSpentMs;
    gameState.currentStepMs = 0;
    gameState.reusableTreeRoot = null;
    gameState.gameOver = false;
    if (!gameState.timerRunning) startMatchClock(false);
    document.getElementById("undoBtn").disabled = gameState.undoStack.length === 0;
    document.getElementById("stageBanner").className = "stage-banner";
    updateScoreboard();
    updateClockUI();
    renderBoard();
  });

  document.getElementById("hintBtn").addEventListener("click", () => {
    if (gameState.isThinking) return;
    const huChar = CHARACTERS[gameState.humanCharIdx];
    const mctsRes = runMCTSSearch(
      gameState.board,
      gameState.currentPlayer,
      {
        simulations: gameState.dynamicSims,
        explorationC: gameState.dynamicC,
        smartRollout: true,
        dynamicWeights: gameState.dynamicWeights
      },
      null
    );
    if (mctsRes.bestCandidate) {
      showToast(`💡 軍師 ${huChar.name} 建議：落子於 ${mctsRes.bestCandidate.notation}（期望勝率 ${(mctsRes.bestCandidate.winRate*100).toFixed(0)}%）`);
    }
  });

  document.getElementById("aiVsAiBtn").addEventListener("click", () => {
    const btn = document.getElementById("aiVsAiBtn");
    if (gameState.aiVsAiActive) {
      clearTimeout(gameState.aiTimerId);
      gameState.aiVsAiActive = false;
      gameState.isThinking = false;
      btn.textContent = "🤖 AI 自動對決";
      updateScoreboard();
      renderBoard();
      return;
    }
    btn.textContent = "⏹ 停止自動對決";
    gameState.aiVsAiActive = true;
    if (!gameState.isThinking) {
      gameState.isThinking = true;
      updateScoreboard();
      gameState.aiTimerId = setTimeout(() => triggerAIMove(), 80);
    }
  });

  document.getElementById("soundToggleBtn").addEventListener("click", () => {
    const enabled = audioMgr.toggleSound();
    document.getElementById("soundToggleBtn").textContent = enabled ? "🔊 音效" : "🔇 靜音";
  });

  // 存檔與記錄檔互動
  document.getElementById("saveRecordBtn").addEventListener("click", openSaveModal);
  document.getElementById("closeSaveModalBtn").addEventListener("click", closeSaveModal);

  document.getElementById("saveGameBtn").addEventListener("click", () => {
    storageMgr.saveCurrentGame({
      stageNum: STAGES[gameState.currentStageIdx].stage,
      board: cloneBoard(gameState.board),
      currentPlayer: gameState.currentPlayer,
      humanColor: gameState.humanColor,
      moveHistory: gameState.moveHistory.slice(),
      humanCharIdx: gameState.humanCharIdx,
      aiCharIdx: gameState.aiCharIdx,
      elapsedTotalMs: gameState.elapsedTotalMs,
      humanSpentMs: gameState.humanSpentMs,
      aiSpentMs: gameState.aiSpentMs
    });
    showToast("💾 當前殘局進度與對弈時間已成功儲存！");
    document.getElementById("loadGameBtn").disabled = false;
  });

  document.getElementById("loadGameBtn").addEventListener("click", () => {
    const saved = storageMgr.getSavedGame();
    if (!saved) return;
    clearTimeout(gameState.aiTimerId);
    gameState.currentStageIdx = Math.max(0, saved.stageNum - 1);
    gameState.board = cloneBoard(saved.board);
    gameState.currentPlayer = saved.currentPlayer;
    gameState.humanColor = saved.humanColor;
    gameState.moveHistory = saved.moveHistory.slice();
    gameState.humanCharIdx = saved.humanCharIdx ?? 1;
    gameState.aiCharIdx = saved.aiCharIdx ?? 0;
    gameState.elapsedTotalMs = saved.elapsedTotalMs || 0;
    gameState.humanSpentMs = saved.humanSpentMs || 0;
    gameState.aiSpentMs = saved.aiSpentMs || 0;
    gameState.currentStepMs = 0;
    gameState.lastMove = null;
    gameState.reusableTreeRoot = null;
    gameState.isThinking = false;
    gameState.gameOver = false;

    startMatchClock(false);
    audioMgr.playStageBGM(saved.stageNum);
    updateStageButtons();
    updateScoreboard();
    updateClockUI();
    renderBoard();
    closeSaveModal();
    showToast(`📂 已讀取第 ${saved.stageNum} 關殘局存檔！`);
  });

  document.getElementById("exportSaveBtn").addEventListener("click", () => {
    storageMgr.exportSaveFile();
    showToast("📥 記錄檔已匯出下載 (JSON)！");
  });

  document.getElementById("importFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const ok = storageMgr.importSaveFile(evt.target.result);
      if (ok) {
        gameState.humanCharIdx = storageMgr.data.selectedHumanCharIdx ?? 1;
        showToast("✅ 記錄檔匯入成功！關卡、選角與對弈時間紀錄已同步。");
        updateStageButtons();
        updateScoreboard();
        renderBoard();
        closeSaveModal();
      } else {
        showToast("❌ 記錄檔格式錯誤，匯入失敗。");
      }
    };
    reader.readAsText(file);
  });

  document.getElementById("resetProgressBtn").addEventListener("click", () => {
    storageMgr.resetAllProgress();
    showToast("進度已重置至第 1 關！");
    selectStage(0);
    closeSaveModal();
  });

  // 設計師調試面板
  document.getElementById("openDevBtn").addEventListener("click", openDevModal);
  document.getElementById("closeDevModalBtn").addEventListener("click", closeDevModal);
}

// 啟動遊戲
initEvents();
selectStage(0);
