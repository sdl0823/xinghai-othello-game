// js/mcts_engine.js - 蒙地卡羅樹搜尋 (MCTS) 演算法模組
class MCTSNode {
  constructor(board, playerToMove, moveFromParent = null, parent = null, priorScore = 0) {
    this.board = board;
    this.playerToMove = playerToMove;
    this.move = moveFromParent;
    this.parent = parent;
    this.children = [];
    this.untriedMoves = getLegalMoves(board, playerToMove);
    this.visits = 0;
    this.wins = 0;
    this.priorScore = priorScore;
  }

  isFullyExpanded() {
    return this.untriedMoves.length === 0;
  }

  getUCB1(explorationC) {
    if (this.visits === 0) return Infinity;
    const exploitation = this.wins / this.visits;
    const exploration = explorationC * Math.sqrt(Math.log(this.parent.visits) / this.visits);
    const progressiveBias = (0.12 * this.priorScore) / (1 + this.visits);
    return exploitation + exploration + progressiveBias;
  }
}

function evaluateMovePrior(board, move, player, dynamicWeights) {
  const { r, c, flips } = move;
  let raw = BASE_POSITION_WEIGHTS[r][c];

  const cornerMap = [
    { cr: 0, cc: 0, adj: [[0,1],[1,0],[1,1]] },
    { cr: 0, cc: 7, adj: [[0,6],[1,7],[1,6]] },
    { cr: 7, cc: 0, adj: [[6,0],[7,1],[6,1]] },
    { cr: 7, cc: 7, adj: [[6,7],[7,6],[6,6]] }
  ];
  for (const cm of cornerMap) {
    if (board[cm.cr][cm.cc] !== EMPTY) {
      for (const [ar, ac] of cm.adj) {
        if (r === ar && c === ac) {
          raw = board[cm.cr][cm.cc] === player ? 28 : 10;
        }
      }
    }
  }

  if ((r === 0 || r === 7) && (c === 0 || c === 7)) {
    raw *= (dynamicWeights?.cornerMultiplier || 1.25);
  } else if (raw < -20) {
    raw *= (dynamicWeights?.xPenaltyMultiplier || 1.20);
  }

  const counts = countDiscs(board);
  if (counts.total < 44) {
    raw -= flips.length * 1.2 * (dynamicWeights?.mobilityMultiplier || 1.15);
  } else {
    raw += flips.length * 2.0;
  }

  return Math.max(-1, Math.min(1, raw / 120));
}

function runSimulation(node, rootPlayer, smartRollout, dynamicWeights) {
  let simBoard = cloneBoard(node.board);
  let simPlayer = node.playerToMove;
  let passCount = 0;
  let stepLimit = 64;

  while (stepLimit-- > 0) {
    const legal = getLegalMoves(simBoard, simPlayer);
    if (legal.length === 0) {
      passCount++;
      if (passCount >= 2) break;
      simPlayer = -simPlayer;
      continue;
    }
    passCount = 0;

    let chosenMove;
    if (!smartRollout || Math.random() < 0.18) {
      chosenMove = legal[Math.floor(Math.random() * legal.length)];
    } else {
      let bestScore = -Infinity;
      chosenMove = legal[0];
      for (let i = 0; i < legal.length; i++) {
        const m = legal[i];
        const prior = evaluateMovePrior(simBoard, m, simPlayer, dynamicWeights);
        const jitter = (Math.random() - 0.5) * 0.25;
        const s = prior + jitter;
        if (s > bestScore) {
          bestScore = s;
          chosenMove = m;
        }
      }
    }

    simBoard = applyMove(simBoard, chosenMove, simPlayer);
    simPlayer = -simPlayer;
  }

  const { black, white } = countDiscs(simBoard);
  if (black === white) return 0.5;
  const winner = black > white ? BLACK : WHITE;
  const marginBonus = Math.min(0.08, Math.abs(black - white) / 640);
  return winner === rootPlayer ? (0.92 + marginBonus) : (0.08 - marginBonus);
}

function runMCTSSearch(board, playerToMove, config, reusedRoot = null) {
  const startTime = performance.now();
  const rootLegal = getLegalMoves(board, playerToMove);
  if (rootLegal.length === 0) {
    return { bestMove: null, candidates: [], totalSims: 0, reusedSims: 0, elapsedMs: 0, rootNode: null };
  }

  let rootNode;
  let reusedSims = 0;

  if (reusedRoot && reusedRoot.playerToMove === playerToMove && reusedRoot.visits > 0) {
    rootNode = reusedRoot;
    rootNode.parent = null;
    reusedSims = rootNode.visits;
  } else {
    rootNode = new MCTSNode(cloneBoard(board), playerToMove);
  }

  const totalSimBudget = config.simulations || 500;
  const explorationC = config.explorationC || 1.41;
  const smartRollout = config.smartRollout !== false;
  const dynamicWeights = config.dynamicWeights || { cornerMultiplier: 1.25, mobilityMultiplier: 1.15, xPenaltyMultiplier: 1.20 };

  for (let sim = 0; sim < totalSimBudget; sim++) {
    let node = rootNode;

    // 1. Selection
    while (node.isFullyExpanded() && node.children.length > 0) {
      let bestChild = null;
      let bestUCB = -Infinity;
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const ucb = child.getUCB1(explorationC);
        if (ucb > bestUCB) {
          bestUCB = ucb;
          bestChild = child;
        }
      }
      node = bestChild;
    }

    // 2. Expansion
    if (!node.isFullyExpanded()) {
      const idx = Math.floor(Math.random() * node.untriedMoves.length);
      const move = node.untriedMoves.splice(idx, 1)[0];
      const nextBoard = applyMove(node.board, move, node.playerToMove);
      let nextPlayer = -node.playerToMove;

      if (getLegalMoves(nextBoard, nextPlayer).length === 0) {
        if (getLegalMoves(nextBoard, node.playerToMove).length > 0) {
          nextPlayer = node.playerToMove;
        }
      }

      const prior = evaluateMovePrior(node.board, move, node.playerToMove, dynamicWeights);
      const childNode = new MCTSNode(nextBoard, nextPlayer, move, node, prior);
      node.children.push(childNode);
      node = childNode;
    }

    // 3. Simulation
    const rootReward = runSimulation(node, playerToMove, smartRollout, dynamicWeights);

    // 4. Backpropagation
    let curr = node;
    while (curr !== null) {
      curr.visits += 1;
      if (curr.parent) {
        const mover = curr.parent.playerToMove;
        curr.wins += (mover === playerToMove) ? rootReward : (1 - rootReward);
      } else {
        curr.wins += rootReward;
      }
      curr = curr.parent;
    }
  }

  const candidates = rootNode.children.map(child => {
    const winRate = child.visits > 0 ? (child.wins / child.visits) : 0.5;
    const ucb1 = child.getUCB1(explorationC);
    return {
      move: child.move,
      notation: coordToNotation(child.move.r, child.move.c),
      visits: child.visits,
      winRate: winRate,
      ucb1: ucb1,
      flipsCount: child.move.flips.length,
      node: child
    };
  });

  candidates.sort((a, b) => {
    if (b.visits !== a.visits) return b.visits - a.visits;
    return b.winRate - a.winRate;
  });

  const elapsedMs = Math.round(performance.now() - startTime);
  return {
    bestMove: candidates.length > 0 ? candidates[0].move : rootLegal[0],
    bestCandidate: candidates[0] || null,
    candidates,
    totalSims: rootNode.visits,
    reusedSims,
    elapsedMs,
    rootNode
  };
}
