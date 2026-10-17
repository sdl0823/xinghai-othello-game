// js/audio_manager.js - 音效與關卡背景音樂模組 (支援自動播放解鎖、多路徑偵測、手動載入與合成音備援)
class AudioManager {
  constructor() {
    this.soundEnabled = true;
    this.bgmEnabled = true;
    this.audioCtx = null;
    this.bgmAudio = null;
    this.currentStageNum = 1;
    this.currentBgmName = "";
    this.bgmPendingAutoplay = false;
    this.customStageBlobUrls = {}; // 支援從介面直接選取測試 mp3
    this.sfxCache = {};
    this.statusCallback = null;

    this._initGlobalUnlockListeners();
  }

  onStatusChange(cb) {
    this.statusCallback = cb;
  }

  _notifyStatus(text, isPlaying = false) {
    if (typeof this.statusCallback === "function") {
      this.statusCallback(text, isPlaying);
    }
  }

  // 註冊全頁首次點擊/觸控/按鍵監聽，解決瀏覽器阻擋網頁載入時自動播放 MP3 的問題
  _initGlobalUnlockListeners() {
    const unlockHandler = () => {
      this.ensureAudioContext();
      if (this.bgmEnabled && this.soundEnabled && this.bgmAudio && this.bgmAudio.paused && this.bgmPendingAutoplay) {
        this.bgmAudio.play().then(() => {
          this.bgmPendingAutoplay = false;
          this._notifyStatus(`🎵 播放中：${this.currentBgmName}`, true);
        }).catch(() => {});
      }
    };

    ["pointerdown", "click", "touchstart", "keydown"].forEach(evt => {
      window.addEventListener(evt, unlockHandler, { passive: true });
    });
  }

  ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx && this.audioCtx.state === "suspended") {
      this.audioCtx.resume().catch(() => {});
    }
  }

  toggleSound() {
    this.soundEnabled = !this.soundEnabled;
    if (!this.soundEnabled) {
      if (this.bgmAudio) this.bgmAudio.pause();
      this._notifyStatus("🔇 音樂已靜音", false);
    } else {
      if (this.bgmEnabled) {
        this.playStageBGM(this.currentStageNum, true);
      }
    }
    return this.soundEnabled;
  }

  toggleBGM() {
    if (!this.bgmAudio) {
      this.bgmEnabled = true;
      this.playStageBGM(this.currentStageNum, true);
      return true;
    }
    if (!this.bgmAudio.paused) {
      this.bgmAudio.pause();
      this.bgmEnabled = false;
      this.bgmPendingAutoplay = false;
      this._notifyStatus(`⏸️ 已暫停：${this.currentBgmName}`, false);
      return false;
    } else {
      this.bgmEnabled = true;
      this.soundEnabled = true;
      this.bgmAudio.play().then(() => {
        this.bgmPendingAutoplay = false;
        this._notifyStatus(`🎵 播放中：${this.currentBgmName}`, true);
      }).catch(() => {
        this.playStageBGM(this.currentStageNum, true);
      });
      return true;
    }
  }

  // 支援使用者透過檔案選擇器直接掛載/測試某關的音樂檔
  setCustomStageAudioFile(stageNum, file) {
    if (!file) return;
    if (this.customStageBlobUrls[stageNum]) {
      URL.revokeObjectURL(this.customStageBlobUrls[stageNum]);
    }
    const blobUrl = URL.createObjectURL(file);
    this.customStageBlobUrls[stageNum] = {
      url: blobUrl,
      name: file.name
    };
    if (this.currentStageNum === stageNum) {
      this.playStageBGM(stageNum, true);
    }
  }

  // 嘗試載入 assets/audio/sfx/ 檔案，若無實體檔案則以 Web Audio 合成音播放
  playSfxFile(filename, fallbackFn) {
    if (!this.soundEnabled) return;
    const path = `assets/audio/sfx/${filename}`;
    if (!this.sfxCache[path]) {
      const audio = new Audio(path);
      audio.onerror = () => {
        this.sfxCache[path] = "fallback";
        fallbackFn();
      };
      this.sfxCache[path] = audio;
    }

    const cached = this.sfxCache[path];
    if (cached === "fallback") {
      fallbackFn();
    } else if (cached instanceof Audio) {
      cached.currentTime = 0;
      cached.play().catch(() => fallbackFn());
    }
  }

  playTone(freq, durationMs, type = "sine", gainVal = 0.08) {
    if (!this.soundEnabled) return;
    try {
      this.ensureAudioContext();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationMs / 1000);
    } catch (e) {}
  }

  playMove(isCorner = false) {
    // 若 BGM 因為剛開網頁被瀏覽器擋住，在落子時自動解鎖播放
    if (this.bgmEnabled && this.soundEnabled && this.bgmAudio && this.bgmAudio.paused && this.bgmPendingAutoplay) {
      this.bgmAudio.play().then(() => {
        this.bgmPendingAutoplay = false;
        this._notifyStatus(`🎵 播放中：${this.currentBgmName}`, true);
      }).catch(() => {});
    }

    this.playSfxFile(isCorner ? "corner.mp3" : "move.mp3", () => {
      if (isCorner) {
        this.playTone(587.33, 110, "triangle", 0.12);
        setTimeout(() => this.playTone(880, 200, "triangle", 0.12), 90);
      } else {
        this.playTone(440, 85, "sine", 0.08);
      }
    });
  }

  playStageClear() {
    this.playSfxFile("stage_clear.mp3", () => {
      this.playTone(523.25, 110, "triangle", 0.1);
      setTimeout(() => this.playTone(659.25, 110, "triangle", 0.11), 100);
      setTimeout(() => this.playTone(783.99, 130, "triangle", 0.11), 200);
      setTimeout(() => this.playTone(1046.5, 260, "triangle", 0.13), 310);
    });
  }

  playDefeat() {
    this.playSfxFile("defeat.mp3", () => {
      this.playTone(392, 140, "sawtooth", 0.08);
      setTimeout(() => this.playTone(329.63, 180, "sawtooth", 0.08), 120);
      setTimeout(() => this.playTone(261.63, 260, "sawtooth", 0.09), 260);
    });
  }

  playUnlock() {
    this.playSfxFile("unlock.mp3", () => {
      this.playTone(659.25, 100, "triangle", 0.1);
      setTimeout(() => this.playTone(880, 160, "triangle", 0.12), 110);
    });
  }

  // 多路徑智慧偵測播放關卡 BGM：
  // 依序嘗試：
  // 1. 使用者手動載入的音訊檔
  // 2. assets/audio/stages/stage{N}.mp3 (標準路徑)
  // 3. assets/audio/stage{N}.mp3 (備用路徑)
  // 4. stage{N}.mp3 (根目錄備用路徑)
  // 5. assets/audio/stages/stage1.mp3 (若其他關卡尚未放音樂，可選退回 stage1.mp3)
  playStageBGM(stageNum, forceReload = false) {
    this.currentStageNum = stageNum;

    if (!forceReload && this.bgmAudio && this.currentBgmStage === stageNum && !this.bgmAudio.paused) {
      return;
    }

    if (this.bgmAudio) {
      this.bgmAudio.pause();
      this.bgmAudio = null;
    }

    const candidates = [];
    if (this.customStageBlobUrls[stageNum]) {
      candidates.push({
        url: this.customStageBlobUrls[stageNum].url,
        label: this.customStageBlobUrls[stageNum].name
      });
    }

    candidates.push(
      { url: `assets/audio/stages/stage${stageNum}.mp3`, label: `stage${stageNum}.mp3` },
      { url: `assets/audio/stage${stageNum}.mp3`, label: `stage${stageNum}.mp3` },
      { url: `stage${stageNum}.mp3`, label: `stage${stageNum}.mp3` },
      { url: `assets/audio/stages/stage${stageNum}.wav`, label: `stage${stageNum}.wav` },
      { url: `assets/audio/stages/stage${stageNum}.ogg`, label: `stage${stageNum}.ogg` }
    );

    // 若非第 1 關且該關尚未放入專屬 mp3，最後備援嘗試播放 stage1.mp3
    if (stageNum !== 1) {
      candidates.push(
        { url: `assets/audio/stages/stage1.mp3`, label: `stage1.mp3 (通用BGM)` },
        { url: `stage1.mp3`, label: `stage1.mp3 (通用BGM)` }
      );
    }

    this._tryLoadCandidateBGM(stageNum, candidates, 0);
  }

  _tryLoadCandidateBGM(stageNum, candidates, index) {
    if (stageNum !== this.currentStageNum) return;
    if (index >= candidates.length) {
      this.currentBgmName = `無音樂檔 (stage${stageNum}.mp3)`;
      this._notifyStatus(`🎵 未偵測到 stage${stageNum}.mp3`, false);
      return;
    }

    const item = candidates[index];
    const bgm = new Audio();
    bgm.preload = "auto";
    bgm.loop = true;
    bgm.volume = 0.45;

    let settled = false;

    const handleSuccess = () => {
      if (settled || stageNum !== this.currentStageNum) return;
      settled = true;
      this.bgmAudio = bgm;
      this.currentBgmStage = stageNum;
      this.currentBgmName = item.label;

      if (!this.soundEnabled || !this.bgmEnabled) {
        this._notifyStatus(`⏸️ 已就緒：${item.label}`, false);
        return;
      }

      bgm.play().then(() => {
        this.bgmPendingAutoplay = false;
        this._notifyStatus(`🎵 播放中：${item.label}`, true);
      }).catch(() => {
        // 瀏覽器阻擋未互動前自動播放：標記為待解鎖，使用者點擊畫面任一處即刻播放！
        this.bgmPendingAutoplay = true;
        this._notifyStatus(`🎵 點擊畫面任意處播放 (${item.label})`, false);
      });
    };

    const handleError = () => {
      if (settled || stageNum !== this.currentStageNum) return;
      settled = true;
      bgm.src = "";
      this._tryLoadCandidateBGM(stageNum, candidates, index + 1);
    };

    bgm.addEventListener("canplay", handleSuccess, { once: true });
    bgm.addEventListener("loadeddata", handleSuccess, { once: true });
    bgm.addEventListener("error", handleError, { once: true });

    bgm.src = item.url;
    bgm.load();
  }
}

const audioMgr = new AudioManager();
