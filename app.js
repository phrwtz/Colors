/** @typedef {'red'|'blue'|'yellow'|'purple'|'green'|'orange'|'white'} TileColor */
/** @typedef {'landing'|'instructions'|'game'} ScreenName */
/** @typedef {'play'|'demo'} PlayMode */
/** @typedef {'mix'|'white-pair'|'none'} DemoResolution */

const ROW_LENGTHS = [8, 7, 8, 7, 8, 7, 8, 7];
const PRIMARY_COLORS = new Set(['red', 'blue', 'yellow']);
const SVG_NS = 'http://www.w3.org/2000/svg';

const HEX_RADIUS = 34;
const INNER_RADIUS = 24;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const ROW_SPACING = 1.5 * HEX_RADIUS;
const BOARD_PADDING = HEX_RADIUS + 10;

const DRAG_SELECTION_THRESHOLD = 0.6;
const PATH_COLOR_OVERLAP_THRESHOLD = 0.2001;
const DROP_CONTAINMENT_THRESHOLD = 0.6;
const DRAG_DISTANCE_THRESHOLD = 6;

const DEMO_INTRO_MESSAGE = 'Click through these message for an intro into how Colors is played.';
const DEMO_FINAL_PAUSE_MS = 3000;
const DEMO_HOP_MS = 430;
const DEMO_RETURN_MS = 340;

const COLOR_HEX = {
  red: '#d94037',
  blue: '#2763d8',
  yellow: '#f0c419',
  purple: '#b45be7',
  green: '#1fb85f',
  orange: '#f68b2d',
  white: '#ffffff'
};

const COLOR_COMPONENTS = {
  red: ['red'],
  blue: ['blue'],
  yellow: ['yellow'],
  purple: ['red', 'blue'],
  green: ['blue', 'yellow'],
  orange: ['red', 'yellow'],
  white: ['red', 'blue', 'yellow']
};

const COMPONENT_KEY_TO_COLOR = {
  red: 'red',
  blue: 'blue',
  yellow: 'yellow',
  'blue:red': 'purple',
  'blue:yellow': 'green',
  'red:yellow': 'orange',
  'blue:red:yellow': 'white'
};

/** @typedef {{index:number,row:number,col:number,cx:number,cy:number}} TileMeta */

/**
 * @typedef {Object} DragState
 * @property {number|null} sourceIndex
 * @property {TileColor|null} sourceColor
 * @property {number} startPointerX
 * @property {number} startPointerY
 * @property {number} pointerX
 * @property {number} pointerY
 * @property {number|null} hoverTarget
 * @property {number} containmentRatio
 * @property {number} overlapRatio
 * @property {TileColor[]} traversedColors
 */

/**
 * @typedef {Object} GameSnapshot
 * @property {TileColor[]} tiles
 */

/**
 * @typedef {Object} GameState
 * @property {TileColor[]} tiles
 * @property {TileColor[]} initialTiles
 * @property {DragState} dragState
 * @property {GameSnapshot[]} history
 */

/**
 * @typedef {Object} DemoStep
 * @property {string} message
 * @property {boolean} [messageOnly]
 * @property {number} sourceIndex
 * @property {number} targetIndex
 * @property {number[]} pathIndices
 * @property {DemoResolution} resolution
 * @property {boolean} illegalReturn
 */

const boardSvg = document.getElementById('board');
const landingBoardSvg = document.getElementById('landing-board');
const playDemoBtn = document.getElementById('play-demo-btn');
const undoBtn = document.getElementById('undo-btn');
const resetBtn = document.getElementById('reset-btn');
const newBoardBtn = document.getElementById('new-board-btn');

const moveErrorModal = document.getElementById('move-error-modal');
const moveErrorText = document.getElementById('move-error-text');
const moveErrorOkBtn = document.getElementById('move-error-ok-btn');
const moveErrorActions = moveErrorModal?.querySelector('.move-error-actions');
const scoreValueEl = document.getElementById('score-value');

const landingScreen = document.getElementById('landing-screen');
const instructionsScreen = document.getElementById('instructions-screen');
const gameScreen = document.getElementById('game-screen');

const landingDemoBtn = document.getElementById('landing-demo-btn');

const instructionsDemoBtn = document.getElementById('instructions-demo-btn');
const instructionsExitBtn = document.getElementById('instructions-exit-btn');
const demoExitBtn = document.getElementById('demo-exit-btn');

const tilesMeta = buildTileMeta();
const indexByRowCol = new Map(tilesMeta.map((tile) => [keyOf(tile.row, tile.col), tile.index]));

const boardPixelWidth = BOARD_PADDING * 2 + HEX_WIDTH * 8.5;
const boardPixelHeight = BOARD_PADDING * 2 + HEX_RADIUS * 2 + ROW_SPACING * (ROW_LENGTHS.length - 1);
boardSvg?.setAttribute('viewBox', `0 0 ${boardPixelWidth} ${boardPixelHeight}`);
landingBoardSvg?.setAttribute('viewBox', `0 0 ${boardPixelWidth} ${boardPixelHeight}`);

const outerLayer = createSvgEl('g', { id: 'outer-layer' });
const innerLayer = createSvgEl('g', { id: 'inner-layer' });
const previewLayer = createSvgEl('g', { id: 'preview-layer' });
const dragLayer = createSvgEl('g', { id: 'drag-layer' });
const demoLayer = createSvgEl('g', { id: 'demo-layer' });
const landingOuterLayer = createSvgEl('g', { id: 'landing-outer-layer' });
const landingInnerLayer = createSvgEl('g', { id: 'landing-inner-layer' });
boardSvg?.append(outerLayer, innerLayer, previewLayer, dragLayer, demoLayer);
landingBoardSvg?.append(landingOuterLayer, landingInnerLayer);

/** @type {GameState} */
const state = {
  tiles: createShuffledBoard(),
  initialTiles: [],
  dragState: createEmptyDragState(),
  history: []
};
state.initialTiles = [...state.tiles];
let landingTiles = createShuffledBoard();

const appState = {
  /** @type {ScreenName} */
  screen: 'game',
  /** @type {PlayMode} */
  mode: 'play'
};

/** @type {{tiles:TileColor[], initialTiles:TileColor[], history:GameSnapshot[]}|null} */
let playSnapshot = null;

const demoState = {
  active: false,
  running: false,
  stepIndex: 0,
  version: 0,
  finalTimer: /** @type {number|null} */ (null)
};

const demoAnimation = {
  active: false,
  sourceIndex: /** @type {number|null} */ (null),
  color: /** @type {TileColor|null} */ (null),
  x: 0,
  y: 0
};

/** @type {DemoStep[]} */
const DEMO_STEPS = [
  {
    message:
      'You get one point for every white tile created. Maximum score is 60 points.',
    messageOnly: true,
    sourceIndex: 0,
    targetIndex: 0,
    pathIndices: [],
    resolution: 'none',
    illegalReturn: false
  },
  {
    message:
      'A blue tile moves onto a neighboring red tile to produce a purple tile. One white tile is created and adds to the score.',
    sourceIndex: 1,
    targetIndex: 2,
    pathIndices: [],
    resolution: 'mix',
    illegalReturn: false
  },
  {
    message:
      'A yellow tile moves onto a neighboring blue tile to produce a green tile. One white tile is created and adds to the score.',
    sourceIndex: 4,
    targetIndex: 5,
    pathIndices: [],
    resolution: 'mix',
    illegalReturn: false
  },
  {
    message:
      'A red tile moves onto a neighboring yellow tile to produce an orange tile. One white tile is created and adds to the score.',
    sourceIndex: 9,
    targetIndex: 10,
    pathIndices: [],
    resolution: 'mix',
    illegalReturn: false
  },
  {
    message:
      'A blue tile moves onto an orange tile and produces a white tile. Two white tiles are created and scored.',
    sourceIndex: 11,
    targetIndex: 10,
    pathIndices: [],
    resolution: 'white-pair',
    illegalReturn: false
  },
  {
    message:
      'A green tile moves onto a yellow tile and produces a white tile. Two white tiles are created and scored.',
    sourceIndex: 5,
    targetIndex: 6,
    pathIndices: [],
    resolution: 'white-pair',
    illegalReturn: false
  },
  {
    message:
      'A blue tile travels along a set of blue tiles and then lands on a yellow tile to produce a green tile.',
    sourceIndex: 18,
    targetIndex: 23,
    pathIndices: [17, 16, 15],
    resolution: 'mix',
    illegalReturn: false
  },
  {
    message:
      'A blue tile tries to land on a purple tile but that tile already contains blue so the move is illegal and the tile returns home.',
    sourceIndex: 3,
    targetIndex: 2,
    pathIndices: [],
    resolution: 'none',
    illegalReturn: true
  },
  {
    message:
      "A blue tile travels along two blue tiles, then along two yellow tiles before trying to land on a red tile. Once a tile has chosen a color to travel or land on it can't change its mind so this move is illegal and the tile returns home.",
    sourceIndex: 46,
    targetIndex: 51,
    pathIndices: [47, 48, 49, 50],
    resolution: 'none',
    illegalReturn: true
  },
  {
    message:
      'A red tile tries to move onto a white tile. No tile is allowed to move onto a white tile so the move is illegal.',
    sourceIndex: 12,
    targetIndex: 11,
    pathIndices: [],
    resolution: 'none',
    illegalReturn: true
  },
  {
    message:
      'You score one for every tile you clear. There are 60 tiles, 20 of each color, so the maximum score is 60. Good luck!',
    messageOnly: true,
    sourceIndex: 0,
    targetIndex: 0,
    pathIndices: [],
    resolution: 'none',
    illegalReturn: false
  }
];

initializeBoardStatic();
initializeLandingBoardStatic();
renderLandingBoard();
enterGamePlay({ freshBoard: true });

boardSvg.addEventListener('pointerdown', onPointerDown);
boardSvg.addEventListener('pointermove', onPointerMove);
boardSvg.addEventListener('pointerup', onPointerUp);
boardSvg.addEventListener('pointercancel', cancelDrag);
boardSvg.addEventListener('lostpointercapture', cancelDrag);

moveErrorOkBtn?.addEventListener('click', onMoveErrorButtonClick);

resetBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  state.tiles = [...state.initialTiles];
  state.dragState = createEmptyDragState();
  state.history = [];
  hideMoveError(true);
  render();
});

newBoardBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  const fresh = createShuffledBoard();
  state.tiles = [...fresh];
  state.initialTiles = [...fresh];
  state.dragState = createEmptyDragState();
  state.history = [];
  hideMoveError(true);
  render();
});

undoBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  if (state.history.length === 0) return;

  const previous = state.history.pop();
  if (!previous) return;

  state.tiles = [...previous.tiles];
  state.dragState = createEmptyDragState();
  hideMoveError(true);
  render();
});

landingDemoBtn?.addEventListener('click', enterDemoMode);
instructionsDemoBtn?.addEventListener('click', enterDemoMode);
instructionsExitBtn?.addEventListener('click', onInstructionsExit);
demoExitBtn?.addEventListener('click', exitDemoToGame);
playDemoBtn?.addEventListener('click', enterDemoMode);

/** @returns {DragState} */
function createEmptyDragState() {
  return {
    sourceIndex: null,
    sourceColor: null,
    startPointerX: 0,
    startPointerY: 0,
    pointerX: 0,
    pointerY: 0,
    hoverTarget: null,
    containmentRatio: 0,
    overlapRatio: 0,
    traversedColors: []
  };
}

function enterLandingScreen() {
  stopDemoMode();
  appState.mode = 'play';
  landingTiles = createShuffledBoard();
  renderLandingBoard();
  hideMoveError(true);
  setScreen('landing');
}

function enterInstructionsScreen() {
  stopDemoMode();
  appState.mode = 'play';
  hideMoveError(true);
  setScreen('instructions');
}

function onInstructionsExit() {
  hideMoveError(true);
  setScreen('game');
  render();
}

function capturePlaySnapshot() {
  playSnapshot = {
    tiles: [...state.tiles],
    initialTiles: [...state.initialTiles],
    history: state.history.map((snapshot) => ({ tiles: [...snapshot.tiles] }))
  };
}

function restorePlaySnapshot() {
  if (!playSnapshot) return;
  state.tiles = [...playSnapshot.tiles];
  state.initialTiles = [...playSnapshot.initialTiles];
  state.history = playSnapshot.history.map((snapshot) => ({ tiles: [...snapshot.tiles] }));
}

function exitDemoToGame() {
  if (appState.mode !== 'demo') return;

  stopDemoMode();
  appState.mode = 'play';
  setScreen('game');
  gameScreen?.classList.remove('demo-mode');

  if (moveErrorOkBtn) {
    moveErrorOkBtn.textContent = 'OK';
    moveErrorOkBtn.disabled = false;
  }

  restorePlaySnapshot();
  state.dragState = createEmptyDragState();
  clearDemoAnimation();
  hideMoveError(true);
  render();
}

/**
 * @param {{freshBoard?:boolean}} options
 */
function enterGamePlay(options = {}) {
  const { freshBoard = true } = options;
  stopDemoMode();

  appState.mode = 'play';
  setScreen('game');
  gameScreen?.classList.remove('demo-mode');

  if (demoExitBtn) {
    demoExitBtn.classList.add('hidden');
  }

  if (moveErrorOkBtn) {
    moveErrorOkBtn.textContent = 'OK';
    moveErrorOkBtn.disabled = false;
  }
  hideMoveError(true);

  if (freshBoard) {
    const fresh = createShuffledBoard();
    state.tiles = [...fresh];
    state.initialTiles = [...fresh];
    state.history = [];
  }

  state.dragState = createEmptyDragState();
  clearDemoAnimation();
  render();
}

function enterDemoMode() {
  capturePlaySnapshot();
  stopDemoMode();

  appState.mode = 'demo';
  setScreen('game');
  gameScreen?.classList.add('demo-mode');

  if (demoExitBtn) {
    demoExitBtn.classList.remove('hidden');
  }

  state.tiles = createDemoBoard();
  state.initialTiles = [...state.tiles];
  state.dragState = createEmptyDragState();

  demoState.active = true;
  demoState.running = false;
  demoState.stepIndex = 0;

  showMoveMessage(DEMO_INTRO_MESSAGE, 'Next', false);
  render();
}

function stopDemoMode() {
  if (demoState.finalTimer !== null) {
    window.clearTimeout(demoState.finalTimer);
    demoState.finalTimer = null;
  }

  demoState.active = false;
  demoState.running = false;
  demoState.stepIndex = 0;
  demoState.version += 1;

  clearDemoAnimation();
  if (demoExitBtn) {
    demoExitBtn.classList.add('hidden');
  }
}

/**
 * @param {ScreenName} screen
 */
function setScreen(screen) {
  appState.screen = screen;

  landingScreen?.classList.toggle('hidden', screen !== 'landing');
  instructionsScreen?.classList.toggle('hidden', screen !== 'instructions');
  gameScreen?.classList.toggle('hidden', screen !== 'game');
}

function onMoveErrorButtonClick() {
  if (appState.mode === 'demo' && demoState.active) {
    void advanceDemoStep();
    return;
  }
  hideMoveError();
}

async function advanceDemoStep() {
  if (!demoState.active || demoState.running) return;
  if (demoState.stepIndex >= DEMO_STEPS.length) return;

  const step = DEMO_STEPS[demoState.stepIndex];
  demoState.stepIndex += 1;
  demoState.running = true;

  showMoveMessage(step.message, 'Next', true);

  const version = demoState.version;
  const completed = await playDemoStep(step, version);
  if (!completed || !isDemoVersionActive(version)) return;

  demoState.running = false;
  render();

  if (demoState.stepIndex >= DEMO_STEPS.length) {
    if (moveErrorOkBtn) {
      moveErrorOkBtn.disabled = true;
    }

    demoState.finalTimer = window.setTimeout(() => {
      if (appState.mode === 'demo') {
        exitDemoToGame();
      }
    }, DEMO_FINAL_PAUSE_MS);
    return;
  }

  if (moveErrorOkBtn) {
    moveErrorOkBtn.disabled = false;
  }
}

/**
 * @param {DemoStep} step
 * @param {number} version
 * @returns {Promise<boolean>}
 */
async function playDemoStep(step, version) {
  if (step.messageOnly) {
    clearDemoAnimation();
    render();
    return true;
  }

  const animated = await animateDemoPath(step, version);
  if (!animated || !isDemoVersionActive(version)) return false;

  applyDemoResolution(step);
  clearDemoAnimation();
  render();
  return true;
}

/**
 * @param {DemoStep} step
 * @param {number} version
 * @returns {Promise<boolean>}
 */
async function animateDemoPath(step, version) {
  if (!isDemoVersionActive(version)) return false;

  const sourceColor = state.tiles[step.sourceIndex];
  const sourcePoint = getTileCenter(step.sourceIndex);
  setDemoAnimation(step.sourceIndex, sourceColor, sourcePoint.x, sourcePoint.y);
  render();

  /** @type {{x:number,y:number}[]} */
  const waypoints = [...step.pathIndices, step.targetIndex].map((index) => getTileCenter(index));

  let currentPoint = sourcePoint;
  for (const destination of waypoints) {
    const moved = await tweenDemoPosition(currentPoint, destination, DEMO_HOP_MS, version);
    if (!moved) return false;
    currentPoint = destination;
  }

  if (step.illegalReturn) {
    const paused = await waitForDemoMs(160, version);
    if (!paused) return false;

    const returned = await tweenDemoPosition(currentPoint, sourcePoint, DEMO_RETURN_MS, version);
    if (!returned) return false;
  }

  return true;
}

/**
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {number} durationMs
 * @param {number} version
 * @returns {Promise<boolean>}
 */
function tweenDemoPosition(from, to, durationMs, version) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    /**
     * @param {number} now
     */
    function frame(now) {
      if (!isDemoVersionActive(version)) {
        resolve(false);
        return;
      }

      const progress = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeInOutCubic(progress);

      demoAnimation.x = from.x + (to.x - from.x) * eased;
      demoAnimation.y = from.y + (to.y - from.y) * eased;
      render();

      if (progress < 1) {
        requestAnimationFrame(frame);
        return;
      }

      resolve(true);
    }

    requestAnimationFrame(frame);
  });
}

/**
 * @param {number} ms
 * @param {number} version
 * @returns {Promise<boolean>}
 */
function waitForDemoMs(ms, version) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(isDemoVersionActive(version));
    }, ms);
  });
}

/**
 * @param {number} t
 * @returns {number}
 */
function easeInOutCubic(t) {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * @param {number} version
 * @returns {boolean}
 */
function isDemoVersionActive(version) {
  return demoState.active && appState.mode === 'demo' && demoState.version === version;
}

/**
 * @param {DemoStep} step
 */
function applyDemoResolution(step) {
  if (step.resolution === 'none') return;

  const nextTiles = [...state.tiles];
  const sourceColor = state.tiles[step.sourceIndex];
  const targetColor = state.tiles[step.targetIndex];

  if (step.resolution === 'mix') {
    const mixed = mix(sourceColor, targetColor);
    if (!mixed) return;

    nextTiles[step.sourceIndex] = 'white';
    nextTiles[step.targetIndex] = mixed;
    state.tiles = nextTiles;
    return;
  }

  if (step.resolution === 'white-pair') {
    nextTiles[step.sourceIndex] = 'white';
    nextTiles[step.targetIndex] = 'white';
    state.tiles = nextTiles;
  }
}

/**
 * @param {number} sourceIndex
 * @param {TileColor} color
 * @param {number} x
 * @param {number} y
 */
function setDemoAnimation(sourceIndex, color, x, y) {
  demoAnimation.active = true;
  demoAnimation.sourceIndex = sourceIndex;
  demoAnimation.color = color;
  demoAnimation.x = x;
  demoAnimation.y = y;
}

function clearDemoAnimation() {
  demoAnimation.active = false;
  demoAnimation.sourceIndex = null;
  demoAnimation.color = null;
  demoAnimation.x = 0;
  demoAnimation.y = 0;
}

/**
 * @param {number} index
 * @returns {{x:number,y:number}}
 */
function getTileCenter(index) {
  const tile = tilesMeta[index];
  return { x: tile.cx, y: tile.cy };
}

/**
 * @param {string} message
 * @param {string} buttonLabel
 * @param {boolean} disabled
 */
function showMoveMessage(message, buttonLabel, disabled) {
  if (!moveErrorModal || !moveErrorText || !moveErrorOkBtn) return;
  moveErrorText.textContent = message;
  moveErrorOkBtn.textContent = buttonLabel;
  moveErrorOkBtn.disabled = disabled;

  if (appState.mode === 'demo') {
    moveErrorOkBtn.classList.remove('hidden');
    moveErrorActions?.classList.remove('hidden');
  } else {
    moveErrorOkBtn.classList.add('hidden');
    moveErrorOkBtn.disabled = true;
    moveErrorActions?.classList.add('hidden');
  }

  moveErrorModal.classList.remove('hidden');
}

/** @returns {TileColor[]} */
function createShuffledBoard() {
  /** @type {TileColor[]} */
  const colors = [];
  for (let i = 0; i < 20; i += 1) {
    colors.push('red', 'blue', 'yellow');
  }
  shuffleInPlace(colors);
  return colors;
}

/** @returns {TileColor[]} */
function createDemoBoard() {
  /** @type {(TileColor|null)[]} */
  const board = Array.from({ length: tilesMeta.length }, () => null);
  const remaining = { red: 20, blue: 20, yellow: 20 };

  /** @type {Array<[number,TileColor]>} */
  const fixedTiles = [
    [1, 'blue'],
    [2, 'red'],
    [3, 'blue'],
    [4, 'yellow'],
    [5, 'blue'],
    [6, 'yellow'],
    [9, 'red'],
    [10, 'yellow'],
    [11, 'blue'],
    [12, 'red'],
    [15, 'blue'],
    [16, 'blue'],
    [17, 'blue'],
    [18, 'blue'],
    [23, 'yellow'],
    [30, 'red'],
    [31, 'blue'],
    [32, 'blue'],
    [33, 'blue'],
    [34, 'yellow'],
    [35, 'yellow'],
    [36, 'yellow'],
    [46, 'blue'],
    [47, 'blue'],
    [48, 'blue'],
    [49, 'yellow'],
    [50, 'yellow'],
    [51, 'red']
  ];

  for (const [index, color] of fixedTiles) {
    board[index] = color;
    remaining[color] -= 1;
  }

  /** @type {TileColor[]} */
  const pool = [];
  for (let i = 0; i < remaining.red; i += 1) pool.push('red');
  for (let i = 0; i < remaining.blue; i += 1) pool.push('blue');
  for (let i = 0; i < remaining.yellow; i += 1) pool.push('yellow');
  shuffleInPlace(pool);

  for (let i = 0; i < board.length; i += 1) {
    if (board[i] === null) {
      board[i] = pool.pop() || 'red';
    }
  }

  return /** @type {TileColor[]} */ (board);
}

/**
 * @template T
 * @param {T[]} values
 */
function shuffleInPlace(values) {
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
}

/**
 * @param {number} index
 * @returns {number[]}
 */
function getNeighbors(index) {
  const tile = tilesMeta[index];
  const row = tile.row;
  const col = tile.col;
  const length = ROW_LENGTHS[row];
  const neighbors = [];

  const sameRowCandidates = [col - 1, col + 1];
  for (const c of sameRowCandidates) {
    const idx = indexByRowCol.get(keyOf(row, c));
    if (typeof idx === 'number') neighbors.push(idx);
  }

  const crossRows = [row - 1, row + 1];
  for (const r of crossRows) {
    if (r < 0 || r >= ROW_LENGTHS.length) continue;

    const candidateCols =
      length === 8
        ? [col - 1, col]
        : [col, col + 1];

    for (const c of candidateCols) {
      const idx = indexByRowCol.get(keyOf(r, c));
      if (typeof idx === 'number') neighbors.push(idx);
    }
  }

  return [...new Set(neighbors)];
}

/**
 * @param {TileColor} color
 * @returns {boolean}
 */
function isPrimary(color) {
  return PRIMARY_COLORS.has(color);
}

/**
 * @param {TileColor} color
 * @returns {boolean}
 */
function isMovable(color) {
  return color !== 'white';
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @returns {TileColor|null}
 */
function mix(sourceColor, targetColor) {
  if (!isMovable(sourceColor) || !isMovable(targetColor)) return null;

  const sourceComponents = COLOR_COMPONENTS[sourceColor];
  const targetComponents = COLOR_COMPONENTS[targetColor];

  const hasOverlap = sourceComponents.some((component) => targetComponents.includes(component));
  if (hasOverlap) return null;

  const combinedKey = [...new Set([...sourceComponents, ...targetComponents])]
    .sort()
    .join(':');

  return COMPONENT_KEY_TO_COLOR[combinedKey] || null;
}

/**
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {GameState} gameState
 * @returns {boolean}
 */
function canDrop(sourceIndex, targetIndex, gameState) {
  if (sourceIndex === targetIndex) return false;

  const source = gameState.tiles[sourceIndex];
  const target = gameState.tiles[targetIndex];
  if (!isMovable(source) || !isMovable(target)) return false;
  if (mix(source, target) === null) return false;

  return true;
}

/**
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {GameState} gameState
 * @returns {GameState}
 */
function applyMove(sourceIndex, targetIndex, gameState) {
  const sourceColor = gameState.tiles[sourceIndex];
  const targetColor = gameState.tiles[targetIndex];
  const mixed = mix(sourceColor, targetColor);
  if (!mixed) return gameState;

  const nextTiles = [...gameState.tiles];
  nextTiles[sourceIndex] = 'white';
  nextTiles[targetIndex] = mixed;

  return {
    ...gameState,
    tiles: nextTiles
  };
}

/**
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;

  const sourceIndex = readIndexFromEvent(event);
  if (sourceIndex === null) return;

  const color = state.tiles[sourceIndex];
  if (!isMovable(color)) return;

  hideMoveError(true);

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState = {
    ...createEmptyDragState(),
    sourceIndex,
    sourceColor: color,
    startPointerX: point.x,
    startPointerY: point.y,
    pointerX: point.x,
    pointerY: point.y
  };

  boardSvg.setPointerCapture(event.pointerId);
  render();
}

/**
 * @param {PointerEvent} event
 */
function onPointerMove(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (state.dragState.sourceIndex === null) return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;

  updateHoverTarget();
  trackDragPath();
  render();
}

/**
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (state.dragState.sourceIndex === null) return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;
  updateHoverTarget();
  trackDragPath();

  const sourceIndex = state.dragState.sourceIndex;
  const target = state.dragState.hoverTarget;
  const containment = state.dragState.containmentRatio;
  const hasValidTarget =
    typeof target === 'number' &&
    canDrop(sourceIndex, target, state) &&
    containment >= DROP_CONTAINMENT_THRESHOLD;

  if (hasValidTarget) {
    const sourceColor = state.tiles[sourceIndex];
    const targetColor = state.tiles[target];
    const firstIllegalColor = getFirstIllegalTraversedColor(
      sourceColor,
      targetColor,
      state.dragState.traversedColors
    );

    if (firstIllegalColor === null) {
      state.history.push({
        tiles: [...state.tiles]
      });
      const updated = applyMove(sourceIndex, target, state);
      state.tiles = updated.tiles;
      hideMoveError(true);
    } else {
      showMoveError(getIllegalPathColorMessage(sourceColor, firstIllegalColor, targetColor));
    }
  } else if (pointerMovedEnough()) {
    showMoveError(getIllegalMoveMessage(sourceIndex));
  }

  if (boardSvg.hasPointerCapture(event.pointerId)) {
    boardSvg.releasePointerCapture(event.pointerId);
  }

  state.dragState = createEmptyDragState();
  render();
}

function cancelDrag() {
  if (appState.mode !== 'play') return;
  if (state.dragState.sourceIndex === null) return;
  state.dragState = createEmptyDragState();
  render();
}

function updateHoverTarget() {
  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null || state.dragState.sourceColor === null) {
    state.dragState.hoverTarget = null;
    state.dragState.containmentRatio = 0;
    state.dragState.overlapRatio = 0;
    return;
  }

  const draggedPoly = getDraggedInnerPolygon();
  const draggedArea = Math.abs(polygonArea(draggedPoly));
  if (draggedArea <= 0) {
    state.dragState.hoverTarget = null;
    state.dragState.containmentRatio = 0;
    state.dragState.overlapRatio = 0;
    return;
  }

  let bestTarget = null;
  let bestContainment = 0;
  let bestOverlap = 0;

  for (const tile of tilesMeta) {
    const idx = tile.index;
    if (idx === sourceIndex) continue;
    if (!canDrop(sourceIndex, idx, state)) continue;

    const overlap = getOverlapForIndex(draggedPoly, draggedArea, idx);
    if (!overlap) continue;
    const containment = overlap.containment;
    if (containment > bestContainment) {
      bestContainment = containment;
      bestOverlap = overlap.targetCoverage;
      bestTarget = idx;
    }
  }

  state.dragState.hoverTarget = bestTarget;
  state.dragState.containmentRatio = bestContainment;
  state.dragState.overlapRatio = bestOverlap;
}

function trackDragPath() {
  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null) return;

  const draggedPoly = getDraggedInnerPolygon();
  const overlaps = getOverlappedTileIndices(draggedPoly, PATH_COLOR_OVERLAP_THRESHOLD);
  if (overlaps.length === 0) return;

  for (const idx of overlaps) {
    if (idx === sourceIndex) continue;
    observeTraversedColor(state.tiles[idx]);
  }
}

/**
 * @param {TileColor} color
 */
function observeTraversedColor(color) {
  if (!state.dragState.traversedColors.includes(color)) {
    state.dragState.traversedColors.push(color);
  }
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor[]} traversedColors
 * @returns {TileColor|null}
 */
function getFirstIllegalTraversedColor(sourceColor, targetColor, traversedColors) {
  for (const color of traversedColors) {
    if (color !== sourceColor && color !== targetColor) {
      return color;
    }
  }
  return null;
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} illegalColor
 * @param {TileColor} targetColor
 * @returns {string}
 */
function getIllegalPathColorMessage(sourceColor, illegalColor, targetColor) {
  return `You passed ${colorTilePhrase(sourceColor)} though ${colorTilePhrase(illegalColor)} before dropping it on ${colorTilePhrase(targetColor)}. That is illegal and the tile returned home.`;
}

/**
 * @param {number} sourceIndex
 * @returns {string}
 */
function getIllegalMoveMessage(sourceIndex) {
  const sourceColor = state.tiles[sourceIndex];
  const sourceTile = colorTilePhrase(sourceColor);
  const release = getBestReleaseCandidate(sourceIndex);
  const releaseTile = release.index;

  // 1) First check placement accuracy on the intended target.
  if (releaseTile === null) {
    return 'You tried to drop a tile outside the target zone. Try again.';
  }

  const releaseColor = state.tiles[releaseTile];
  if (release.containment < DROP_CONTAINMENT_THRESHOLD) {
    return 'You tried to drop a tile outside the target zone. Try again.';
  }

  // 2) Next check the selected target tile color legality.
  if (releaseColor === 'white') {
    return 'You tried to drop a tile onto an empty space. That is illegal.';
  }
  if (sourceColor === releaseColor) {
    return 'You tried to drop a tile on another tile of the same color. That is illegal.';
  }
  if (mix(sourceColor, releaseColor) === null) {
    const sourceComponents = COLOR_COMPONENTS[sourceColor];
    const targetComponents = COLOR_COMPONENTS[releaseColor];
    const sharedComponents = sourceComponents.filter((component) => targetComponents.includes(component));

    if (sharedComponents.length > 0) {
      const sharedPhrase =
        sharedComponents.length === 1
          ? sharedComponents[0]
          : formatColorList(sharedComponents);
      if (sourceComponents.length > 1 && targetComponents.length > 1) {
        return `You tried to drop ${sourceTile} on ${colorTilePhrase(releaseColor)} but both contain ${sharedPhrase} so that is illegal.`;
      }
      return `You tried to drop ${sourceTile} on ${colorTilePhrase(releaseColor)} but ${releaseColor} contains ${sharedPhrase} so that is illegal.`;
    }

    return `You tried to drop ${sourceTile} on ${colorTilePhrase(releaseColor)}. That is illegal.`;
  }

  return `You tried to place ${sourceTile} on ${colorTilePhrase(releaseColor)} in an illegal way.`;
}

/**
 * @param {number} sourceIndex
 * @returns {{index:number|null, containment:number, targetCoverage:number}}
 */
function getBestReleaseCandidate(sourceIndex) {
  const draggedPoly = getDraggedInnerPolygon();
  const draggedArea = Math.abs(polygonArea(draggedPoly));
  if (draggedArea <= 0) {
    return { index: null, containment: 0, targetCoverage: 0 };
  }

  let bestIdx = null;
  let bestContainment = 0;
  let bestCoverage = 0;

  for (const tile of tilesMeta) {
    if (tile.index === sourceIndex) continue;
    const overlap = getOverlapForIndex(draggedPoly, draggedArea, tile.index);
    if (!overlap) continue;
    if (overlap.targetCoverage > bestCoverage) {
      bestCoverage = overlap.targetCoverage;
      bestContainment = overlap.containment;
      bestIdx = tile.index;
    }
  }

  if (bestCoverage < DRAG_SELECTION_THRESHOLD || bestIdx === null) {
    return { index: null, containment: bestContainment, targetCoverage: bestCoverage };
  }

  return { index: bestIdx, containment: bestContainment, targetCoverage: bestCoverage };
}

/**
 * @param {TileColor} color
 * @returns {string}
 */
function colorLabel(color) {
  return color;
}

/**
 * @param {TileColor} color
 * @returns {string}
 */
function colorTilePhrase(color) {
  const article = startsWithVowelSound(color) ? 'an' : 'a';
  return `${article} ${color} tile`;
}

/**
 * @param {string} word
 * @returns {boolean}
 */
function startsWithVowelSound(word) {
  return /^[aeiou]/i.test(word);
}

/**
 * @param {TileColor[]} colors
 * @returns {string}
 */
function formatColorList(colors) {
  const labels = colors.map((color) => colorLabel(color));
  if (labels.length === 0) return 'an unknown color';
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * @param {{x:number,y:number}[]} draggedPoly
 * @param {number} minTargetCoverage
 * @returns {number[]}
 */
function getOverlappedTileIndices(draggedPoly, minTargetCoverage) {
  const draggedArea = Math.abs(polygonArea(draggedPoly));
  if (draggedArea <= 0) return [];

  const overlaps = [];
  for (const tile of tilesMeta) {
    const overlap = getOverlapForIndex(draggedPoly, draggedArea, tile.index);
    if (overlap && overlap.targetCoverage >= minTargetCoverage) {
      overlaps.push(tile.index);
    }
  }
  return overlaps;
}

/**
 * @param {{x:number,y:number}[]} draggedPoly
 * @param {number} draggedArea
 * @param {number} index
 * @returns {{containment:number,targetCoverage:number}|null}
 */
function getOverlapForIndex(draggedPoly, draggedArea, index) {
  const targetPoly = getInnerPolygonAtIndex(index);
  const clipped = clipPolygonConvex(draggedPoly, targetPoly);
  const overlapArea = Math.abs(polygonArea(clipped));
  if (overlapArea <= 0) return null;

  return {
    containment: overlapArea / draggedArea,
    targetCoverage: overlapArea / Math.abs(polygonArea(targetPoly))
  };
}

/**
 * @returns {boolean}
 */
function pointerMovedEnough() {
  const dx = state.dragState.pointerX - state.dragState.startPointerX;
  const dy = state.dragState.pointerY - state.dragState.startPointerY;
  return Math.hypot(dx, dy) >= DRAG_DISTANCE_THRESHOLD;
}

/**
 * @param {string} message
 */
function showMoveError(message) {
  if (appState.mode !== 'play') return;
  showMoveMessage(message, 'OK', false);
}

/**
 * @param {boolean} force
 */
function hideMoveError(force = false) {
  if (!moveErrorModal) return;
  if (!force && appState.mode === 'demo') return;
  moveErrorModal.classList.add('hidden');
}

function initializeBoardStatic() {
  outerLayer.innerHTML = '';
  innerLayer.innerHTML = '';

  for (const tile of tilesMeta) {
    const outerGroup = createSvgEl('g', {
      class: 'tile-shell'
    });
    const innerGroup = createSvgEl('g', {
      class: 'tile-group',
      'data-index': String(tile.index),
      role: 'img'
    });

    const outer = createSvgEl('polygon', {
      class: 'outer',
      points: pointsToAttr(hexPoints(tile.cx, tile.cy, HEX_RADIUS))
    });

    const inner = createSvgEl('polygon', {
      class: 'inner',
      points: pointsToAttr(hexPoints(tile.cx, tile.cy, INNER_RADIUS))
    });

    outerGroup.append(outer);
    innerGroup.append(inner);
    outerLayer.appendChild(outerGroup);
    innerLayer.appendChild(innerGroup);
  }
}

function initializeLandingBoardStatic() {
  if (!landingBoardSvg) return;

  landingOuterLayer.innerHTML = '';
  landingInnerLayer.innerHTML = '';

  for (const tile of tilesMeta) {
    const outerGroup = createSvgEl('g', {
      class: 'landing-tile-shell'
    });
    const innerGroup = createSvgEl('g', {
      class: 'landing-tile-group',
      'data-index': String(tile.index),
      role: 'img'
    });

    const outer = createSvgEl('polygon', {
      class: 'outer',
      points: pointsToAttr(hexPoints(tile.cx, tile.cy, HEX_RADIUS))
    });

    const inner = createSvgEl('polygon', {
      class: 'inner',
      points: pointsToAttr(hexPoints(tile.cx, tile.cy, INNER_RADIUS))
    });

    outerGroup.append(outer);
    innerGroup.append(inner);
    landingOuterLayer.appendChild(outerGroup);
    landingInnerLayer.appendChild(innerGroup);
  }
}

function renderLandingBoard() {
  if (!landingBoardSvg) return;

  const groups = landingInnerLayer.querySelectorAll('.landing-tile-group');
  groups.forEach((group) => {
    const idx = Number(group.getAttribute('data-index'));
    const color = landingTiles[idx] || 'red';
    const inner = group.querySelector('.inner');
    inner?.setAttribute('fill', COLOR_HEX[color]);
    group.setAttribute(
      'aria-label',
      `Row ${tilesMeta[idx].row + 1}, Column ${tilesMeta[idx].col + 1}, ${color} tile`
    );
  });
}

function render() {
  renderInnerTiles();
  renderPreview();
  renderDragLayer();
  renderDemoLayer();
  updateScore();
  updateUndoButtonState();
}

function renderInnerTiles() {
  const draggedSourceIndex = state.dragState.sourceIndex;
  const animatedSourceIndex = demoAnimation.active ? demoAnimation.sourceIndex : null;

  const groups = innerLayer.querySelectorAll('.tile-group');
  groups.forEach((group) => {
    const idx = Number(group.getAttribute('data-index'));
    const color = state.tiles[idx];
    const inner = group.querySelector('.inner');

    const displayColor = draggedSourceIndex === idx || animatedSourceIndex === idx ? 'white' : color;
    inner.setAttribute('fill', COLOR_HEX[displayColor]);

    group.classList.toggle('draggable', appState.mode === 'play' && isMovable(color));
    group.classList.toggle('dragging-source', draggedSourceIndex === idx);
    group.setAttribute(
      'aria-label',
      `Row ${tilesMeta[idx].row + 1}, Column ${tilesMeta[idx].col + 1}, ${displayColor} tile`
    );
  });
}

function renderPreview() {
  previewLayer.innerHTML = '';
  if (appState.mode !== 'play') return;

  const sourceIndex = state.dragState.sourceIndex;
  const targetIndex = state.dragState.hoverTarget;
  if (sourceIndex === null || targetIndex === null) return;

  if (!canDrop(sourceIndex, targetIndex, state)) return;

  const sourceColor = state.tiles[sourceIndex];
  const targetColor = state.tiles[targetIndex];
  const mixed = mix(sourceColor, targetColor);
  if (!mixed) return;

  const draggedPoly = getDraggedInnerPolygon();
  const targetPoly = getInnerPolygonAtIndex(targetIndex);
  const overlapPoly = clipPolygonConvex(draggedPoly, targetPoly);
  if (overlapPoly.length < 3) return;

  const preview = createSvgEl('polygon', {
    class: 'overlap-preview',
    points: pointsToAttr(overlapPoly),
    fill: COLOR_HEX[mixed]
  });

  previewLayer.appendChild(preview);
}

function renderDragLayer() {
  dragLayer.innerHTML = '';
  if (appState.mode !== 'play') return;

  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null || state.dragState.sourceColor === null) return;

  const draggedPoly = getDraggedInnerPolygon();
  const piece = createSvgEl('polygon', {
    class: 'drag-inner',
    points: pointsToAttr(draggedPoly),
    fill: COLOR_HEX[state.dragState.sourceColor]
  });
  dragLayer.appendChild(piece);
}

function renderDemoLayer() {
  demoLayer.innerHTML = '';
  if (!demoAnimation.active || demoAnimation.color === null) return;

  const piece = createSvgEl('polygon', {
    class: 'drag-inner',
    points: pointsToAttr(hexPoints(demoAnimation.x, demoAnimation.y, INNER_RADIUS)),
    fill: COLOR_HEX[demoAnimation.color]
  });
  demoLayer.appendChild(piece);
}

function updateScore() {
  if (!scoreValueEl) return;
  const score = state.tiles.reduce((acc, tile) => (tile === 'white' ? acc + 1 : acc), 0);
  scoreValueEl.textContent = String(score);
}

function updateUndoButtonState() {
  if (!undoBtn) return;

  const enabled = appState.mode === 'play' && state.history.length > 0;
  undoBtn.disabled = !enabled;
}

/** @returns {{x:number,y:number}[]} */
function getDraggedInnerPolygon() {
  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null) return [];

  const sourceTile = tilesMeta[sourceIndex];
  const dx = state.dragState.pointerX - state.dragState.startPointerX;
  const dy = state.dragState.pointerY - state.dragState.startPointerY;
  return hexPoints(sourceTile.cx + dx, sourceTile.cy + dy, INNER_RADIUS);
}

/**
 * @param {number} index
 * @returns {{x:number,y:number}[]}
 */
function getInnerPolygonAtIndex(index) {
  const tile = tilesMeta[index];
  return hexPoints(tile.cx, tile.cy, INNER_RADIUS);
}

/**
 * Build center positions using pointy-top hexes with alternating 8/7 row offsets.
 * @returns {TileMeta[]}
 */
function buildTileMeta() {
  const tiles = [];
  let index = 0;

  for (let row = 0; row < ROW_LENGTHS.length; row += 1) {
    const len = ROW_LENGTHS[row];
    const rowOffsetX = len === 7 ? HEX_WIDTH / 2 : 0;
    const cy = BOARD_PADDING + HEX_RADIUS + row * ROW_SPACING;

    for (let col = 0; col < len; col += 1) {
      const cx = BOARD_PADDING + HEX_WIDTH / 2 + rowOffsetX + col * HEX_WIDTH;
      tiles.push({ index, row, col, cx, cy });
      index += 1;
    }
  }

  return tiles;
}

/**
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {{x:number,y:number}[]}
 */
function hexPoints(cx, cy, radius) {
  const points = [];
  for (let i = 0; i < 6; i += 1) {
    const angleDeg = 60 * i - 90;
    const angleRad = (Math.PI / 180) * angleDeg;
    points.push({
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad)
    });
  }
  return points;
}

/**
 * @param {{x:number,y:number}[]} points
 * @returns {number}
 */
function polygonArea(points) {
  if (points.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    area += p1.x * p2.y - p2.x * p1.y;
  }
  return area / 2;
}

/**
 * Sutherland-Hodgman clipping for convex polygons.
 * @param {{x:number,y:number}[]} subject
 * @param {{x:number,y:number}[]} clipper
 * @returns {{x:number,y:number}[]}
 */
function clipPolygonConvex(subject, clipper) {
  if (subject.length < 3 || clipper.length < 3) return [];

  const clipperArea = polygonArea(clipper);
  let output = [...subject];

  for (let i = 0; i < clipper.length; i += 1) {
    const a = clipper[i];
    const b = clipper[(i + 1) % clipper.length];
    const input = output;
    output = [];

    if (input.length === 0) break;

    let prev = input[input.length - 1];
    for (const curr of input) {
      const currInside = isInsideEdge(curr, a, b, clipperArea);
      const prevInside = isInsideEdge(prev, a, b, clipperArea);

      if (currInside) {
        if (!prevInside) {
          output.push(lineIntersection(prev, curr, a, b));
        }
        output.push(curr);
      } else if (prevInside) {
        output.push(lineIntersection(prev, curr, a, b));
      }

      prev = curr;
    }
  }

  return output;
}

/**
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {number} windingArea
 * @returns {boolean}
 */
function isInsideEdge(p, a, b, windingArea) {
  const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return windingArea >= 0 ? cross >= -1e-7 : cross <= 1e-7;
}

/**
 * Line intersection between segment p1->p2 and infinite edge a->b.
 * @param {{x:number,y:number}} p1
 * @param {{x:number,y:number}} p2
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {{x:number,y:number}}
 */
function lineIntersection(p1, p2, a, b) {
  const x1 = p1.x;
  const y1 = p1.y;
  const x2 = p2.x;
  const y2 = p2.y;
  const x3 = a.x;
  const y3 = a.y;
  const x4 = b.x;
  const y4 = b.y;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 1e-8) {
    return { x: x2, y: y2 };
  }

  const determinant1 = x1 * y2 - y1 * x2;
  const determinant2 = x3 * y4 - y3 * x4;

  const x = (determinant1 * (x3 - x4) - (x1 - x2) * determinant2) / denominator;
  const y = (determinant1 * (y3 - y4) - (y1 - y2) * determinant2) / denominator;
  return { x, y };
}

/**
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x:number,y:number}}
 */
function svgPointFromClient(clientX, clientY) {
  const pt = boardSvg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(boardSvg.getScreenCTM().inverse());
  return { x: transformed.x, y: transformed.y };
}

/**
 * @param {PointerEvent} event
 * @returns {number|null}
 */
function readIndexFromEvent(event) {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  if (!target.classList.contains('inner')) return null;
  const group = target.closest('.tile-group');
  if (!group) return null;

  const idx = Number(group.getAttribute('data-index'));
  return Number.isInteger(idx) ? idx : null;
}

/**
 * @param {number} row
 * @param {number} col
 * @returns {string}
 */
function keyOf(row, col) {
  return `${row}:${col}`;
}

/**
 * @param {string} name
 * @param {Record<string,string>} attrs
 * @returns {SVGElement}
 */
function createSvgEl(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

/**
 * @param {{x:number,y:number}[]} points
 * @returns {string}
 */
function pointsToAttr(points) {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');
}
