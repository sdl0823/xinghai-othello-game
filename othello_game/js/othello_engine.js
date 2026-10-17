// js/othello_engine.js - 黑白棋核心規則引擎
const BLACK = 1;
const WHITE = -1;
const EMPTY = 0;

const DIRECTIONS = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1]
];

const BASE_POSITION_WEIGHTS = [
  [ 120, -25,  20,   5,   5,  20, -25, 120],
  [ -25, -45,  -5,  -5,  -5,  -5, -45, -25],
  [  20,  -5,  15,   3,   3,  15,  -5,  20],
  [   5,  -5,   3,   3,   3,   3,  -5,   5],
  [   5,  -5,   3,   3,   3,   3,  -5,   5],
  [  20,  -5,  15,   3,   3,  15,  -5,  20],
  [ -25, -45,  -5,  -5,  -5,  -5, -45, -25],
  [ 120, -25,  20,   5,   5,  20, -25, 120]
];

function createInitialBoard() {
  const b = Array.from({ length: 8 }, () => Array(8).fill(EMPTY));
  b[3][3] = WHITE;
  b[3][4] = BLACK;
  b[4][3] = BLACK;
  b[4][4] = WHITE;
  return b;
}

function cloneBoard(board) {
  return board.map(row => row.slice());
}

function getFlips(board, r, c, player) {
  if (board[r][c] !== EMPTY) return [];
  const opp = -player;
  const allFlips = [];
  for (let d = 0; d < 8; d++) {
    const dr = DIRECTIONS[d][0];
    const dc = DIRECTIONS[d][1];
    let nr = r + dr;
    let nc = c + dc;
    const line = [];
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === opp) {
      line.push([nr, nc]);
      nr += dr;
      nc += dc;
    }
    if (line.length > 0 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === player) {
      for (let i = 0; i < line.length; i++) allFlips.push(line[i]);
    }
  }
  return allFlips;
}

function getLegalMoves(board, player) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === EMPTY) {
        const flips = getFlips(board, r, c, player);
        if (flips.length > 0) {
          moves.push({ r, c, flips });
        }
      }
    }
  }
  return moves;
}

function applyMove(board, move, player) {
  const next = cloneBoard(board);
  next[move.r][move.c] = player;
  for (let i = 0; i < move.flips.length; i++) {
    const [fr, fc] = move.flips[i];
    next[fr][fc] = player;
  }
  return next;
}

function countDiscs(board) {
  let black = 0, white = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === BLACK) black++;
      else if (board[r][c] === WHITE) white++;
    }
  }
  return { black, white, total: black + white };
}

function coordToNotation(r, c) {
  return String.fromCharCode(65 + c) + (r + 1);
}
