/** @typedef {'red'|'blue'|'yellow'|'purple'|'green'|'orange'|'white'} TileColor */
/** @typedef {'landing'|'instructions'|'game'} ScreenName */
/** @typedef {'play'|'demo'} PlayMode */
/** @typedef {'standard'|'analysis'} PlayVariant */
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
const PATH_COLOR_OVERLAP_THRESHOLD = 0.5;
const DROP_CONTAINMENT_THRESHOLD = 0.6;
const DRAG_DISTANCE_THRESHOLD = 6;
const ANALYSIS_GRAPH_WIDTH = 420;
const ANALYSIS_GRAPH_HEIGHT = 340;
const ANALYSIS_GRAPH_NODE_RADIUS = 17;
const ANALYSIS_GRAPH_PADDING = 30;
const ANALYSIS_TRANSFER_HOP_MS = 130;
const ANALYSIS_TRANSFER_PAUSE_MS = 45;

const DEMO_INTRO_MESSAGE = 'Click through this demo to see how Splash is played.';
const DEMO_HOP_MS = 430;
const DEMO_RETURN_MS = 340;
const STANDARD_GAME_SUBTITLE_HTML =
  'Drag colors to create new colors. All three primary colors clear the cell.<br />You get one point for every empty cell. Try to clear the whole board. Hint: it can be done!';
const ANALYSIS_SUBTITLE_TEXT =
  'You can drag colors onto the empty board or populate it with random colors by clicking on New Board. The nodes on the graph represent "blobs" - areas of adjacent tiles of the same color - on the board. The numbers in each node denote how many tiles there are in that blob. Adjacent blobs are connected by arcs between the corresponding nodes. The graph automatically updates when you make a move on the board. You can move its nodes to improve legibility, or drag one node onto another mixable node to auto-transfer as many safe moves as possible between those blobs.';

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
 * @property {'board'|'palette'|null} sourceType
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
const analysisBtn = document.getElementById('analysis-btn');
const undoBtn = document.getElementById('undo-btn');
const resetBtn = document.getElementById('reset-btn');
const newBoardBtn = document.getElementById('new-board-btn');
const clearBoardBtn = document.getElementById('clear-board-btn');
const analysisMixFeedbackEl = document.getElementById('analysis-mix-feedback');
const analysisPalette = document.getElementById('analysis-palette');
const analysisGraphWrap = document.getElementById('analysis-graph-wrap');
const analysisGraphSvg = document.getElementById('analysis-graph');
const gameBoardWrap = document.querySelector('#game-screen .board-layout .board-wrap');
const analysisSwatches = Array.from(document.querySelectorAll('.analysis-swatch'));

const moveErrorModal = document.getElementById('move-error-modal');
const moveErrorText = document.getElementById('move-error-text');
const moveErrorOkBtn = document.getElementById('move-error-ok-btn');
const moveErrorActions = moveErrorModal?.querySelector('.move-error-actions');
const scoreValueEl = document.getElementById('score-value');
const bestScoreValueEl = document.getElementById('best-score-value');
const undoCountValueEl = document.getElementById('undo-count-value');
const noMovesNoticeEl = document.getElementById('no-moves-notice');
const gameSubtitleEl = document.getElementById('game-subtitle');

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
analysisGraphSvg?.setAttribute('viewBox', `0 0 ${ANALYSIS_GRAPH_WIDTH} ${ANALYSIS_GRAPH_HEIGHT}`);
analysisGraphSvg?.setAttribute('width', String(ANALYSIS_GRAPH_WIDTH));
analysisGraphSvg?.setAttribute('height', String(ANALYSIS_GRAPH_HEIGHT));
analysisGraphSvg?.setAttribute('preserveAspectRatio', 'xMidYMid meet');

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
  mode: 'play',
  /** @type {PlayVariant} */
  playVariant: 'standard'
};

const BEST_SCORE_STORAGE_KEY = 'splash_best_score';
const analysisUnlocked = readAnalysisUnlocked();
analysisBtn?.classList.toggle('hidden', !analysisUnlocked);
let bestScore = readBestScore();
let noLegalMovesLeft = false;
let undoCount = 0;

const analysisSessionState = {
  /** @type {TileColor[]|null} */
  maxTiles: null,
  maxColoredCount: -1,
  /** @type {TileColor|null} */
  selectedColor: null,
  paint: {
    active: false,
    pointerId: /** @type {number|null} */ (null),
    didPaint: false,
    lastTileIndex: /** @type {number|null} */ (null)
  }
};

/** @type {{tiles:TileColor[], initialTiles:TileColor[], history:GameSnapshot[], playVariant:PlayVariant}|null} */
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

const analysisGraphState = {
  /** @type {Map<string,{key:string,color:TileColor,x:number,y:number,pinned:boolean,label:string}>} */
  nodes: new Map(),
  /** @type {Array<[string,string]>} */
  edges: [],
  /** @type {Map<string,number[]>} */
  blobMembers: new Map(),
  /** @type {string[]} */
  tileToBlob: Array.from({ length: tilesMeta.length }, () => ''),
  selectedBlobKey: /** @type {string|null} */ (null),
  lastSignature: '',
  drag: {
    active: false,
    nodeKey: /** @type {string|null} */ (null),
    pointerId: /** @type {number|null} */ (null),
    offsetX: 0,
    offsetY: 0,
    startX: 0,
    startY: 0
  }
};
const analysisCursorCache = new Map();
const analysisTransferState = {
  active: false
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
      "Tiles don't have to move in straight lines. They can change direction within the same color.",
    sourceIndex: 31,
    targetIndex: 35,
    pathIndices: [32, 39, 40, 41, 34],
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
      'See if you can make all the tiles white!',
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
boardSvg.addEventListener('pointerleave', onBoardPointerLeave);
analysisGraphSvg?.addEventListener('pointerdown', onGraphPointerDown);
analysisGraphSvg?.addEventListener('pointermove', onGraphPointerMove);
analysisGraphSvg?.addEventListener('pointerup', onGraphPointerUp);
analysisGraphSvg?.addEventListener('pointercancel', onGraphPointerCancel);
analysisGraphSvg?.addEventListener('lostpointercapture', onGraphPointerCancel);
analysisGraphSvg?.addEventListener('pointerleave', onGraphPointerLeave);
window.addEventListener('pointermove', onGlobalPointerMove);
window.addEventListener('pointerup', onGlobalPointerUp);
window.addEventListener('pointercancel', onGlobalPointerCancel);
window.addEventListener('pointerdown', onGlobalPointerDown);
window.addEventListener('resize', syncAnalysisGraphWrapHeight);

moveErrorOkBtn?.addEventListener('click', onMoveErrorButtonClick);
analysisBtn?.addEventListener('click', onAnalysisButtonClick);
analysisSwatches.forEach((swatch) => {
  swatch.addEventListener('pointerdown', onAnalysisSwatchPointerDown);
  swatch.addEventListener('click', onAnalysisSwatchClick);
});

resetBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  if (isAnalysisTransferAnimating()) return;
  if (appState.playVariant === 'analysis') {
    if (analysisSessionState.maxTiles) {
      state.tiles = [...analysisSessionState.maxTiles];
    }
  } else {
    state.tiles = [...state.initialTiles];
  }
  state.dragState = createEmptyDragState();
  state.history = [];
  clearAnalysisMixFeedback();
  updateNoLegalMovesState();
  hideMoveError(true);
  render();
});

newBoardBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  if (isAnalysisTransferAnimating()) return;
  const fresh = createShuffledBoard();
  state.tiles = fresh;
  state.initialTiles = [...fresh];
  state.dragState = createEmptyDragState();
  state.history = [];
  clearAnalysisMixFeedback();
  if (appState.playVariant === 'analysis') {
    startAnalysisSession(fresh);
  }
  updateNoLegalMovesState();
  hideMoveError(true);
  render();
});

clearBoardBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  if (isAnalysisTransferAnimating()) return;
  if (appState.playVariant !== 'analysis') return;
  if (getColoredTileCount(state.tiles) === 0) return;

  state.history.push({
    tiles: [...state.tiles]
  });
  state.tiles = createEmptyBoard();
  state.dragState = createEmptyDragState();
  clearAnalysisMixFeedback();
  updateNoLegalMovesState();
  hideMoveError(true);
  render();
});

undoBtn?.addEventListener('click', () => {
  if (appState.mode !== 'play') return;
  if (isAnalysisTransferAnimating()) return;
  if (state.history.length === 0) return;

  const previous = state.history.pop();
  if (!previous) return;

  undoCount += 1;
  state.tiles = [...previous.tiles];
  state.dragState = createEmptyDragState();
  clearAnalysisMixFeedback();
  updateNoLegalMovesState();
  hideMoveError(true);
  render();
});

landingDemoBtn?.addEventListener('click', enterDemoMode);
instructionsDemoBtn?.addEventListener('click', enterDemoMode);
instructionsExitBtn?.addEventListener('click', onInstructionsExit);
demoExitBtn?.addEventListener('click', exitDemoToGame);
playDemoBtn?.addEventListener('click', () => {
  if (isAnalysisTransferAnimating()) return;
  enterDemoMode();
});

/** @returns {DragState} */
function createEmptyDragState() {
  return {
    sourceType: null,
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

/**
 * @returns {boolean}
 */
function isAnalysisTransferAnimating() {
  return analysisTransferState.active;
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
    history: state.history.map((snapshot) => ({ tiles: [...snapshot.tiles] })),
    playVariant: appState.playVariant
  };
}

function restorePlaySnapshot() {
  if (!playSnapshot) return;
  state.tiles = [...playSnapshot.tiles];
  state.initialTiles = [...playSnapshot.initialTiles];
  state.history = playSnapshot.history.map((snapshot) => ({ tiles: [...snapshot.tiles] }));
  appState.playVariant = playSnapshot.playVariant || 'standard';
  updatePlayVariantUi();
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
  updateNoLegalMovesState();
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
    const fresh =
      appState.playVariant === 'analysis'
        ? createEmptyBoard()
        : createShuffledBoard();
    state.tiles = fresh;
    state.initialTiles = [...fresh];
    state.history = [];

    if (appState.playVariant === 'analysis') {
      startAnalysisSession(fresh);
    } else {
      clearAnalysisSession();
    }
  }

  state.dragState = createEmptyDragState();
  updatePlayVariantUi();
  updateNoLegalMovesState();
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
  updatePlayVariantUi();
}

function clearAnalysisMixFeedback() {
  if (!analysisMixFeedbackEl) return;
  analysisMixFeedbackEl.textContent = '';
  analysisMixFeedbackEl.classList.add('hidden');
}

/**
 * @param {string} message
 */
function showAnalysisMixFeedback(message) {
  if (!analysisMixFeedbackEl) return;
  analysisMixFeedbackEl.textContent = message;
  analysisMixFeedbackEl.classList.remove('hidden');
}

function updatePlayVariantUi() {
  const inGamePlayView =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';
  analysisPalette?.classList.toggle('hidden', !inGamePlayView);
  analysisGraphWrap?.classList.toggle('hidden', !inGamePlayView);
  clearBoardBtn?.classList.toggle('hidden', appState.playVariant !== 'analysis');
  if (!inGamePlayView) {
    clearAnalysisMixFeedback();
  }
  analysisBtn?.classList.toggle('active', appState.playVariant === 'analysis');
  if (analysisBtn) {
    analysisBtn.textContent =
      appState.playVariant === 'analysis'
        ? 'Play the game'
        : 'Analysis';
  }
  gameScreen?.classList.toggle('analysis-mode', appState.playVariant === 'analysis');
  updateAnalysisPaintCursor();
  syncAnalysisGraphWrapHeight();
  if (gameSubtitleEl) {
    if (appState.playVariant === 'analysis') {
      gameSubtitleEl.textContent = ANALYSIS_SUBTITLE_TEXT;
      hideMoveError(true);
    } else {
      gameSubtitleEl.innerHTML = STANDARD_GAME_SUBTITLE_HTML;
      clearAnalysisMixFeedback();
    }
  }
}

function onMoveErrorButtonClick() {
  if (appState.mode === 'demo' && demoState.active) {
    void advanceDemoStep();
    return;
  }
  hideMoveError();
}

function onAnalysisButtonClick() {
  if (!analysisUnlocked) return;
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;
  clearAnalysisMixFeedback();

  const switchingToAnalysis = appState.playVariant !== 'analysis';
  appState.playVariant = switchingToAnalysis ? 'analysis' : 'standard';
  updatePlayVariantUi();

  const fresh = createEmptyBoard();
  state.tiles = fresh;
  state.initialTiles = [...fresh];
  state.history = [];
  state.dragState = createEmptyDragState();

  if (switchingToAnalysis) {
    startAnalysisSession(fresh);
  } else {
    clearAnalysisSession();
  }
  analysisSessionState.selectedColor = null;
  resetAnalysisPaintState();

  hideMoveError(true);
  updateNoLegalMovesState();
  render();
}

/**
 * @param {PointerEvent} event
 */
function onAnalysisSwatchPointerDown(event) {
  if (isAnalysisTransferAnimating()) return;
  selectAnalysisSwatchFromEvent(event);
  event.preventDefault();
}

/**
 * @param {MouseEvent} event
 */
function onAnalysisSwatchClick(event) {
  if (isAnalysisTransferAnimating()) return;
  selectAnalysisSwatchFromEvent(event);
}

/**
 * @param {Event} event
 */
function selectAnalysisSwatchFromEvent(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (appState.playVariant !== 'analysis') return;
  if (isAnalysisTransferAnimating()) return;

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  const color = target.dataset.color;
  if (!color || !isPrimary(/** @type {TileColor} */ (color))) return;
  const counts = getAnalysisPrimaryCounts();
  if ((color === 'red' || color === 'blue' || color === 'yellow') && counts[color] >= 20) {
    return;
  }
  analysisSessionState.selectedColor = /** @type {TileColor} */ (color);
  resetAnalysisPaintState();
  hideMoveError(true);
  render();
  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }
  if (typeof event.stopPropagation === 'function') {
    event.stopPropagation();
  }
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
      moveErrorOkBtn.classList.add('hidden');
    }
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
function createEmptyBoard() {
  return Array.from({ length: tilesMeta.length }, () => 'white');
}

/**
 * @param {TileColor[]} tiles
 * @returns {number}
 */
function getColoredTileCount(tiles) {
  return tiles.reduce((acc, tile) => (tile === 'white' ? acc : acc + 1), 0);
}

/**
 * @param {TileColor[]} tiles
 */
function startAnalysisSession(tiles) {
  analysisSessionState.maxTiles = [...tiles];
  analysisSessionState.maxColoredCount = getColoredTileCount(tiles);
}

function clearAnalysisSession() {
  analysisSessionState.maxTiles = null;
  analysisSessionState.maxColoredCount = -1;
}

function maybeCaptureAnalysisMaxState() {
  if (appState.playVariant !== 'analysis') return;
  const coloredCount = getColoredTileCount(state.tiles);
  if (coloredCount > analysisSessionState.maxColoredCount) {
    analysisSessionState.maxColoredCount = coloredCount;
    analysisSessionState.maxTiles = [...state.tiles];
  }
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
    [39, 'blue'],
    [40, 'blue'],
    [41, 'yellow'],
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

function updateNoLegalMovesState() {
  noLegalMovesLeft = !hasAnyLegalMoves(state.tiles);
}

/**
 * @param {TileColor[]} tiles
 * @returns {boolean}
 */
function hasAnyLegalMoves(tiles) {
  for (let sourceIndex = 0; sourceIndex < tiles.length; sourceIndex += 1) {
    const sourceColor = tiles[sourceIndex];
    if (!isMovable(sourceColor)) continue;

    for (let targetIndex = 0; targetIndex < tiles.length; targetIndex += 1) {
      if (targetIndex === sourceIndex) continue;
      const targetColor = tiles[targetIndex];
      if (!isMovable(targetColor)) continue;
      if (!mix(sourceColor, targetColor)) continue;

      if (hasColorConstrainedPath(sourceIndex, targetIndex, sourceColor, targetColor, tiles)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor[]} tiles
 * @returns {boolean}
 */
function hasColorConstrainedPath(sourceIndex, targetIndex, sourceColor, targetColor, tiles) {
  return (
    findColorConstrainedPath(
      sourceIndex,
      targetIndex,
      sourceColor,
      targetColor,
      tiles
    ) !== null
  );
}

/**
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor[]} tiles
 * @returns {number[]|null}
 */
function findColorConstrainedPath(
  sourceIndex,
  targetIndex,
  sourceColor,
  targetColor,
  tiles
) {
  if (sourceIndex === targetIndex) {
    return [sourceIndex];
  }

  const queue = [sourceIndex];
  const visited = new Set([sourceIndex]);
  /** @type {Map<number,number>} */
  const previous = new Map();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const neighbor of getNeighbors(current)) {
      if (visited.has(neighbor)) continue;

      const isTarget = neighbor === targetIndex;
      const color = tiles[neighbor];
      if (!isTarget && color !== sourceColor && color !== targetColor) continue;

      visited.add(neighbor);
      previous.set(neighbor, current);

      if (neighbor === targetIndex) {
        /** @type {number[]} */
        const path = [targetIndex];
        let backtrack = targetIndex;
        while (backtrack !== sourceIndex) {
          const parent = previous.get(backtrack);
          if (parent === undefined) return null;
          path.push(parent);
          backtrack = parent;
        }
        path.reverse();
        return path;
      }

      queue.push(neighbor);
    }
  }

  return null;
}

/**
 * @param {PointerEvent} event
 */
function onPointerDown(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;

  if (isAnalysisBoardPaintArmed()) {
    beginAnalysisPaintStroke(event.pointerId);
    const paintTileIndex = getBoardTileIndexFromPointerEvent(event);
    const painted = paintTileIndex !== null && paintAnalysisTile(paintTileIndex);
    if (painted || isAnalysisSelectionActive()) {
      render();
    }
    boardSvg.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }

  const selectionCleared = isAnalysisSelectionActive() && setSelectedBlobKey(null);

  const sourceIndex = readIndexFromEvent(event);
  if (sourceIndex === null) {
    if (selectionCleared) {
      render();
    }
    return;
  }

  const color = state.tiles[sourceIndex];
  if (!isMovable(color)) {
    if (selectionCleared) {
      render();
    }
    return;
  }

  hideMoveError(true);

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState = {
    ...createEmptyDragState(),
    sourceType: 'board',
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
  if (isAnalysisTransferAnimating()) return;

  if (
    analysisSessionState.paint.active &&
    analysisSessionState.paint.pointerId === event.pointerId
  ) {
    const tileIndex = getBoardTileIndexFromPointerEvent(event);
    const painted = tileIndex !== null && paintAnalysisTile(tileIndex);
    if (painted) {
      render();
    }
    return;
  }

  const draggingBoardTile =
    state.dragState.sourceType === 'board' && state.dragState.sourceIndex !== null;
  const selectionChanged = draggingBoardTile
    ? false
    : updateSelectionFromBoardTarget(event.target);

  if (!draggingBoardTile) {
    if (selectionChanged) {
      render();
    }
    return;
  }

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
function onBoardPointerLeave(event) {
  if (!isAnalysisSelectionActive()) return;

  if (setSelectedBlobKey(null)) {
    render();
  }
}

/**
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;

  if (
    analysisSessionState.paint.active &&
    analysisSessionState.paint.pointerId === event.pointerId
  ) {
    endAnalysisPaintStroke(event.pointerId);
    render();
    return;
  }

  if (state.dragState.sourceType !== 'board') return;
  if (state.dragState.sourceIndex === null) return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;
  updateHoverTarget();
  trackDragPath();

  const sourceIndex = state.dragState.sourceIndex;
  const sourceColor = state.tiles[sourceIndex];
  const release = getBestReleaseCandidate(sourceIndex);
  const releaseTile = release.index;

  if (releaseTile === null || release.containment < DROP_CONTAINMENT_THRESHOLD) {
    if (pointerMovedEnough()) {
      showMoveError('You tried to drop a tile outside the target zone. Try again.');
    }
  } else {
    const targetColor = state.tiles[releaseTile];

    // Enforce color legality before evaluating any path rules.
    if (targetColor === 'white') {
      showMoveError('You cannot drop a tile on a white space.');
    } else if (mix(sourceColor, targetColor) === null) {
      showMoveError(
        `You tried to drop ${colorTilePhrase(sourceColor)} on ${colorTilePhrase(targetColor)}. That is illegal and the tile returned home.`
      );
    } else {
      // Only for legal target colors do we apply path-tracing legality.
      const traversedPathColors = getTraversedPathColorsForDrop(
        sourceColor,
        targetColor,
        state.dragState.traversedColors
      );

      const illegalPathMessage = getIllegalPathColorMessage(
        sourceColor,
        targetColor,
        traversedPathColors
      );

      if (illegalPathMessage === null) {
        state.history.push({
          tiles: [...state.tiles]
        });
        const updated = applyMove(sourceIndex, releaseTile, state);
        state.tiles = updated.tiles;
        updateNoLegalMovesState();
        hideMoveError(true);
      } else {
        showMoveError(illegalPathMessage);
      }
    }
  }

  if (boardSvg.hasPointerCapture(event.pointerId)) {
    boardSvg.releasePointerCapture(event.pointerId);
  }

  state.dragState = createEmptyDragState();
  render();
}

/**
 * @param {PointerEvent} event
 */
function onGlobalPointerMove(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;
  if (state.dragState.sourceType !== 'palette') return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;
  updateHoverTarget();
  render();
}

/**
 * @param {PointerEvent} event
 */
function onGlobalPointerUp(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;
  if (state.dragState.sourceType !== 'palette') return;
  finalizePalettePlacement(event);
}

/**
 * @param {PointerEvent} event
 */
function onGlobalPointerDown(event) {
  if (appState.mode !== 'play' || appState.screen !== 'game') return;
  if (isAnalysisTransferAnimating()) return;
  if (appState.playVariant !== 'analysis') return;
  if (!analysisSessionState.selectedColor) return;
  if (isEventInsideAnalysisFillControls(event)) return;

  analysisSessionState.selectedColor = null;
  resetAnalysisPaintState();
  render();
}

/**
 * @param {PointerEvent} event
 */
function finalizePalettePlacement(event) {
  if (state.dragState.sourceType !== 'palette') return;
  const sourceColor = state.dragState.sourceColor;
  if (sourceColor === null) {
    state.dragState = createEmptyDragState();
    render();
    return;
  }

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;
  updateHoverTarget();

  const target = state.dragState.hoverTarget;
  const containment = state.dragState.containmentRatio;
  const canPlace =
    typeof target === 'number' &&
    state.tiles[target] === 'white' &&
    containment >= DROP_CONTAINMENT_THRESHOLD;

  if (canPlace) {
    state.history.push({
      tiles: [...state.tiles]
    });
    state.tiles[target] = sourceColor;
    hideMoveError(true);
    updateNoLegalMovesState();
  } else if (pointerMovedEnough()) {
    if (typeof target === 'number' && state.tiles[target] !== 'white') {
      showMoveError('You can only place analysis tiles on an empty space.');
    } else {
      showMoveError('You tried to drop a tile outside the target zone. Try again.');
    }
  }

  state.dragState = createEmptyDragState();
  render();
}

/**
 * @param {PointerEvent} _event
 */
function onGlobalPointerCancel(_event) {
  if (isAnalysisTransferAnimating()) return;
  if (state.dragState.sourceType !== 'palette') return;
  state.dragState = createEmptyDragState();
  render();
}

function cancelDrag() {
  if (appState.mode !== 'play') return;
  if (isAnalysisTransferAnimating()) return;

  if (analysisSessionState.paint.active) {
    endAnalysisPaintStroke(analysisSessionState.paint.pointerId);
    render();
    return;
  }

  if (state.dragState.sourceIndex === null) return;
  state.dragState = createEmptyDragState();
  render();
}

function updateHoverTarget() {
  if (state.dragState.sourceType === 'palette') {
    updateHoverTargetForPalette();
    return;
  }

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

    const overlap = getOverlapForIndex(draggedPoly, draggedArea, idx, 'outer');
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

function updateHoverTargetForPalette() {
  if (state.dragState.sourceColor === null) {
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
    if (state.tiles[idx] !== 'white') continue;

    const overlap = getOverlapForIndex(draggedPoly, draggedArea, idx, 'outer');
    if (!overlap) continue;

    if (overlap.containment > bestContainment) {
      bestContainment = overlap.containment;
      bestOverlap = overlap.targetCoverage;
      bestTarget = idx;
    }
  }

  state.dragState.hoverTarget = bestTarget;
  state.dragState.containmentRatio = bestContainment;
  state.dragState.overlapRatio = bestOverlap;
}

function trackDragPath() {
  if (state.dragState.sourceType !== 'board') return;
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
  const traversed = state.dragState.traversedColors;
  const lastColor = traversed[traversed.length - 1];
  if (lastColor !== color) {
    traversed.push(color);
  }
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor[]} traversedColors
 * @returns {TileColor[]}
 */
function getTraversedPathColorsForDrop(sourceColor, targetColor, traversedColors) {
  /** @type {TileColor[]} */
  const travelSequence = [];

  for (const color of traversedColors) {
    // A tile's own color is never counted as a passed-through color.
    if (color === sourceColor) continue;

    const lastColor = travelSequence[travelSequence.length - 1];
    if (color !== lastColor) {
      travelSequence.push(color);
    }
  }

  // The compiled path always ends with the drop target color.
  if (travelSequence[travelSequence.length - 1] !== targetColor) {
    travelSequence.push(targetColor);
  }

  return travelSequence;
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor[]} traversedPathColors
 * @returns {string|null}
 */
function getIllegalPathColorMessage(sourceColor, targetColor, traversedPathColors) {
  if (traversedPathColors.includes('white')) {
    return 'You moved your tile onto a white space. That is illegal and the tile returned home.';
  }

  if (traversedPathColors.length > 1) {
    return 'You moved your tile over more than one color. That is illegal and the tile returned home.';
  }

  return null;
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
    return 'You tried to drop a tile on its own color. Try again.';
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
    const overlap = getOverlapForIndex(draggedPoly, draggedArea, tile.index, 'outer');
    if (!overlap) continue;
    if (overlap.targetCoverage > bestCoverage) {
      bestCoverage = overlap.targetCoverage;
      bestContainment = overlap.containment;
      bestIdx = tile.index;
    }
  }

  if (bestIdx === null) {
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
    const overlap = getOverlapForIndex(draggedPoly, draggedArea, tile.index, 'inner');
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
 * @param {'inner'|'outer'} [targetZone]
 * @returns {{containment:number,targetCoverage:number}|null}
 */
function getOverlapForIndex(draggedPoly, draggedArea, index, targetZone = 'inner') {
  const targetPoly =
    targetZone === 'outer'
      ? getOuterPolygonAtIndex(index)
      : getInnerPolygonAtIndex(index);
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
  if (appState.playVariant === 'analysis') return;
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
  syncAnalysisGraphWrapHeight();
  renderAnalysisGraph();
  maybeCaptureAnalysisMaxState();
  renderInnerTiles();
  renderPreview();
  renderDragLayer();
  renderDemoLayer();
  updateScore();
  updateUndoCount();
  renderAnalysisStatus();
  renderNoMovesNotice();
  updateUndoButtonState();
  updateClearBoardButtonState();
}

function syncAnalysisGraphWrapHeight() {
  if (!analysisGraphWrap || !gameBoardWrap) return;

  const analysisActive =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';

  if (!analysisActive) {
    analysisGraphWrap.style.height = '';
    return;
  }

  const boardRect = gameBoardWrap.getBoundingClientRect();
  if (boardRect.height <= 0) return;
  analysisGraphWrap.style.height = `${Math.round(boardRect.height)}px`;
}

function renderAnalysisGraph() {
  if (!analysisGraphSvg) return;

  const analysisActive =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';

  if (!analysisActive) {
    analysisGraphSvg.innerHTML = '';
    analysisGraphState.lastSignature = '';
    analysisGraphState.selectedBlobKey = null;
    analysisGraphState.tileToBlob = Array.from({ length: tilesMeta.length }, () => '');
    analysisGraphState.blobMembers.clear();
    return;
  }

  const boardSignature = state.tiles.join(',');
  if (analysisGraphState.drag.active) {
    drawAnalysisGraph();
    return;
  }

  if (analysisGraphState.lastSignature !== boardSignature) {
    const graphData = buildBlobGraphData(state.tiles);
    syncAnalysisGraphState(graphData.blobs, graphData.edges, graphData.tileToBlob);
    runAnalysisGraphLayout();
    analysisGraphState.lastSignature = boardSignature;
  }

  clampAllAnalysisGraphNodes();
  drawAnalysisGraph();
}

/**
 * @param {TileColor[]} tiles
 * @returns {{blobs:Array<{key:string,color:TileColor,members:number[],cx:number,cy:number,label:string}>,edges:Array<[string,string]>,tileToBlob:string[]}}
 */
function buildBlobGraphData(tiles) {
  const visited = Array.from({ length: tiles.length }, () => false);
  const tileBlobKey = Array.from({ length: tiles.length }, () => '');
  /** @type {Array<{key:string,color:TileColor,members:number[],cx:number,cy:number,label:string}>} */
  const blobs = [];

  for (let i = 0; i < tiles.length; i += 1) {
    if (visited[i]) continue;
    const color = tiles[i];
    if (color === 'white') continue;

    const stack = [i];
    visited[i] = true;
    const members = [];

    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      members.push(current);

      for (const neighbor of getNeighbors(current)) {
        if (visited[neighbor]) continue;
        if (tiles[neighbor] !== color) continue;
        visited[neighbor] = true;
        stack.push(neighbor);
      }
    }

    members.sort((a, b) => a - b);
    const key = members.join('-');
    let cx = 0;
    let cy = 0;
    for (const index of members) {
      cx += tilesMeta[index].cx;
      cy += tilesMeta[index].cy;
      tileBlobKey[index] = key;
    }
    cx /= members.length;
    cy /= members.length;

    blobs.push({
      key,
      color,
      members,
      cx,
      cy,
      label: String(members.length)
    });
  }

  const edgeSet = new Set();
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === 'white') continue;
    const sourceKey = tileBlobKey[i];
    if (!sourceKey) continue;

    for (const neighbor of getNeighbors(i)) {
      if (neighbor <= i) continue;
      if (tiles[neighbor] === 'white') continue;
      const targetKey = tileBlobKey[neighbor];
      if (!targetKey || targetKey === sourceKey) continue;

      const [a, b] = sourceKey < targetKey
        ? [sourceKey, targetKey]
        : [targetKey, sourceKey];
      edgeSet.add(`${a}|${b}`);
    }
  }

  const edges = [...edgeSet].map((edgeKey) => {
    const splitAt = edgeKey.indexOf('|');
    const a = edgeKey.slice(0, splitAt);
    const b = edgeKey.slice(splitAt + 1);
    return /** @type {[string,string]} */ ([a, b]);
  });

  return { blobs, edges, tileToBlob: tileBlobKey };
}

/**
 * @param {Array<{key:string,color:TileColor,members:number[],cx:number,cy:number,label:string}>} blobs
 * @param {Array<[string,string]>} edges
 * @param {string[]} tileToBlob
 */
function syncAnalysisGraphState(blobs, edges, tileToBlob) {
  /** @type {Map<string,{key:string,color:TileColor,x:number,y:number,pinned:boolean,label:string}>} */
  const nextNodes = new Map();
  const xSpan = Math.max(1, boardPixelWidth);
  const ySpan = Math.max(1, boardPixelHeight);

  for (const blob of blobs) {
    const existing = analysisGraphState.nodes.get(blob.key);
    if (existing) {
      const clampedPosition = clampAnalysisGraphPosition(existing.x, existing.y);
      nextNodes.set(blob.key, {
        ...existing,
        color: blob.color,
        label: blob.label,
        x: clampedPosition.x,
        y: clampedPosition.y
      });
      continue;
    }

    const jitterSeed = (hashString(blob.key) % 1000) / 1000;
    const jitterX = (jitterSeed - 0.5) * 14;
    const jitterY = ((hashString(`${blob.key}:y`) % 1000) / 1000 - 0.5) * 14;

    const x =
      ANALYSIS_GRAPH_PADDING +
      (blob.cx / xSpan) * (ANALYSIS_GRAPH_WIDTH - ANALYSIS_GRAPH_PADDING * 2) +
      jitterX;
    const y =
      ANALYSIS_GRAPH_PADDING +
      (blob.cy / ySpan) * (ANALYSIS_GRAPH_HEIGHT - ANALYSIS_GRAPH_PADDING * 2) +
      jitterY;

    const clampedPosition = clampAnalysisGraphPosition(x, y);
    nextNodes.set(blob.key, {
      key: blob.key,
      color: blob.color,
      x: clampedPosition.x,
      y: clampedPosition.y,
      pinned: false,
      label: blob.label
    });
  }

  analysisGraphState.nodes = nextNodes;
  analysisGraphState.edges = edges.filter(
    ([a, b]) => nextNodes.has(a) && nextNodes.has(b)
  );
  analysisGraphState.blobMembers = new Map(
    blobs.map((blob) => [blob.key, [...blob.members]])
  );
  analysisGraphState.tileToBlob = [...tileToBlob];

  if (
    analysisGraphState.drag.nodeKey &&
    !nextNodes.has(analysisGraphState.drag.nodeKey)
  ) {
    analysisGraphState.drag.active = false;
    analysisGraphState.drag.nodeKey = null;
    analysisGraphState.drag.pointerId = null;
    analysisGraphState.drag.startX = 0;
    analysisGraphState.drag.startY = 0;
  }

  if (
    analysisGraphState.selectedBlobKey &&
    !nextNodes.has(analysisGraphState.selectedBlobKey)
  ) {
    analysisGraphState.selectedBlobKey = null;
  }
}

function runAnalysisGraphLayout() {
  const nodes = [...analysisGraphState.nodes.values()];
  if (nodes.length <= 1) {
    clampAllAnalysisGraphNodes();
    return;
  }

  const minSpacing = ANALYSIS_GRAPH_NODE_RADIUS * 2 + 7;
  const preferredEdgeLength = 82;

  for (let iter = 0; iter < 95; iter += 1) {
    /** @type {Map<string,{x:number,y:number}>} */
    const forces = new Map(nodes.map((node) => [node.key, { x: 0, y: 0 }]));

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(0.0001, Math.hypot(dx, dy));
        const ux = dx / distance;
        const uy = dy / distance;

        let push = 0;
        if (distance < minSpacing) {
          push += (minSpacing - distance) * 0.16;
        }
        push += 120 / (distance * distance);

        addForce(forces, a.key, -ux * push, -uy * push);
        addForce(forces, b.key, ux * push, uy * push);
      }
    }

    for (const [aKey, bKey] of analysisGraphState.edges) {
      const a = analysisGraphState.nodes.get(aKey);
      const b = analysisGraphState.nodes.get(bKey);
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.max(0.0001, Math.hypot(dx, dy));
      const ux = dx / distance;
      const uy = dy / distance;
      const pull = (distance - preferredEdgeLength) * 0.025;

      addForce(forces, a.key, ux * pull, uy * pull);
      addForce(forces, b.key, -ux * pull, -uy * pull);
    }

    for (let i = 0; i < analysisGraphState.edges.length; i += 1) {
      for (let j = i + 1; j < analysisGraphState.edges.length; j += 1) {
        const [aKey, bKey] = analysisGraphState.edges[i];
        const [cKey, dKey] = analysisGraphState.edges[j];

        if (
          aKey === cKey ||
          aKey === dKey ||
          bKey === cKey ||
          bKey === dKey
        ) {
          continue;
        }

        const a = analysisGraphState.nodes.get(aKey);
        const b = analysisGraphState.nodes.get(bKey);
        const c = analysisGraphState.nodes.get(cKey);
        const d = analysisGraphState.nodes.get(dKey);
        if (!a || !b || !c || !d) continue;

        if (!segmentsIntersect(a, b, c, d)) continue;

        const midAB = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const midCD = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 };
        const dx = midAB.x - midCD.x;
        const dy = midAB.y - midCD.y;
        const distance = Math.max(0.0001, Math.hypot(dx, dy));
        const ux = dx / distance;
        const uy = dy / distance;

        const strength = 1.4;
        addForce(forces, a.key, ux * strength, uy * strength);
        addForce(forces, b.key, ux * strength, uy * strength);
        addForce(forces, c.key, -ux * strength, -uy * strength);
        addForce(forces, d.key, -ux * strength, -uy * strength);
      }
    }

    for (const [aKey, bKey] of analysisGraphState.edges) {
      const a = analysisGraphState.nodes.get(aKey);
      const b = analysisGraphState.nodes.get(bKey);
      if (!a || !b) continue;

      for (const node of nodes) {
        if (node.key === aKey || node.key === bKey) continue;
        const closest = closestPointOnSegment(node, a, b);
        const dx = node.x - closest.x;
        const dy = node.y - closest.y;
        const distance = Math.max(0.0001, Math.hypot(dx, dy));
        if (distance >= ANALYSIS_GRAPH_NODE_RADIUS + 5) continue;

        const ux = dx / distance;
        const uy = dy / distance;
        const push = (ANALYSIS_GRAPH_NODE_RADIUS + 5 - distance) * 0.2;
        addForce(forces, node.key, ux * push, uy * push);
        addForce(forces, a.key, -ux * push * 0.5, -uy * push * 0.5);
        addForce(forces, b.key, -ux * push * 0.5, -uy * push * 0.5);
      }
    }

    for (const node of nodes) {
      if (node.pinned) continue;
      const force = forces.get(node.key);
      if (!force) continue;
      const clampedPosition = clampAnalysisGraphPosition(
        node.x + clamp(force.x, -3.2, 3.2),
        node.y + clamp(force.y, -3.2, 3.2)
      );
      node.x = clampedPosition.x;
      node.y = clampedPosition.y;
    }
  }

  clampAllAnalysisGraphNodes();
}

function drawAnalysisGraph() {
  if (!analysisGraphSvg) return;
  clampAllAnalysisGraphNodes();
  analysisGraphSvg.innerHTML = '';
  const nodeLabelFontSize = getGraphNodeLabelFontSize();

  for (const [aKey, bKey] of analysisGraphState.edges) {
    const a = analysisGraphState.nodes.get(aKey);
    const b = analysisGraphState.nodes.get(bKey);
    if (!a || !b) continue;

    const edge = createSvgEl('line', {
      class: 'graph-edge',
      x1: String(a.x),
      y1: String(a.y),
      x2: String(b.x),
      y2: String(b.y)
    });
    analysisGraphSvg.appendChild(edge);
  }

  for (const node of analysisGraphState.nodes.values()) {
    const selectedClass =
      analysisGraphState.selectedBlobKey === node.key ? ' selected' : '';
    const group = createSvgEl('g', {
      class: `graph-node${selectedClass}`,
      'data-node-key': node.key
    });
    const circle = createSvgEl('circle', {
      class: 'node-circle',
      cx: String(node.x),
      cy: String(node.y),
      r: String(ANALYSIS_GRAPH_NODE_RADIUS),
      fill: COLOR_HEX[node.color]
    });
    const label = createSvgEl('text', {
      class: 'node-label',
      x: String(node.x),
      y: String(node.y),
      'font-size': String(nodeLabelFontSize)
    });
    label.textContent = node.label;

    const title = createSvgEl('title');
    title.textContent = `${node.color} blob (${node.label} tiles)`;

    group.append(circle, label, title);
    analysisGraphSvg.appendChild(group);
  }
}

function clampAllAnalysisGraphNodes() {
  for (const node of analysisGraphState.nodes.values()) {
    const clampedPosition = clampAnalysisGraphPosition(node.x, node.y);
    node.x = clampedPosition.x;
    node.y = clampedPosition.y;
  }
}

/**
 * @param {number} x
 * @param {number} y
 * @returns {{x:number,y:number}}
 */
function clampAnalysisGraphPosition(x, y) {
  const graphBounds = getAnalysisGraphBounds();
  const minX = graphBounds.minX;
  const maxX = graphBounds.maxX;
  const minY = graphBounds.minY;
  const maxY = graphBounds.maxY;

  const safeX = Number.isFinite(x) ? x : (minX + maxX) / 2;
  const safeY = Number.isFinite(y) ? y : (minY + maxY) / 2;

  return {
    x: clamp(safeX, minX, maxX),
    y: clamp(safeY, minY, maxY)
  };
}

/**
 * @returns {{minX:number,maxX:number,minY:number,maxY:number}}
 */
function getAnalysisGraphBounds() {
  let width = ANALYSIS_GRAPH_WIDTH;
  let height = ANALYSIS_GRAPH_HEIGHT;

  if (analysisGraphSvg) {
    const vb = analysisGraphSvg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      width = vb.width;
      height = vb.height;
    } else {
      const explicitWidth = Number(analysisGraphSvg.getAttribute('width'));
      const explicitHeight = Number(analysisGraphSvg.getAttribute('height'));
      if (Number.isFinite(explicitWidth) && explicitWidth > 0) {
        width = explicitWidth;
      }
      if (Number.isFinite(explicitHeight) && explicitHeight > 0) {
        height = explicitHeight;
      }
    }
  }

  const minX = ANALYSIS_GRAPH_NODE_RADIUS + 4;
  const minY = ANALYSIS_GRAPH_NODE_RADIUS + 4;
  const maxX = Math.max(minX, width - (ANALYSIS_GRAPH_NODE_RADIUS + 4));
  const maxY = Math.max(minY, height - (ANALYSIS_GRAPH_NODE_RADIUS + 4));

  return { minX, maxX, minY, maxY };
}

/**
 * @param {Map<string,{x:number,y:number}>} forceMap
 * @param {string} key
 * @param {number} x
 * @param {number} y
 */
function addForce(forceMap, key, x, y) {
  const force = forceMap.get(key);
  if (!force) return;
  force.x += x;
  force.y += y;
}

/**
 * @returns {number}
 */
function getGraphNodeLabelFontSize() {
  const swatchCountEl = analysisSwatches[0]?.querySelector('.analysis-swatch-count');
  const desiredPxSize = (() => {
    if (!swatchCountEl) return 24;
    const fontSize = Number.parseFloat(window.getComputedStyle(swatchCountEl).fontSize);
    return Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 24;
  })();

  if (!analysisGraphSvg) return desiredPxSize;
  const vb = analysisGraphSvg.viewBox?.baseVal;
  const viewBoxWidth = vb && vb.width > 0 ? vb.width : ANALYSIS_GRAPH_WIDTH;
  const viewBoxHeight = vb && vb.height > 0 ? vb.height : ANALYSIS_GRAPH_HEIGHT;
  const rect = analysisGraphSvg.getBoundingClientRect();
  const widthScale = rect.width > 0 ? rect.width / viewBoxWidth : 1;
  const heightScale = rect.height > 0 ? rect.height / viewBoxHeight : 1;
  const viewportScale = Math.min(widthScale, heightScale);

  if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
    return desiredPxSize;
  }

  return desiredPxSize / viewportScale;
}

/**
 * @param {string} value
 * @returns {number}
 */
function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * @param {{x:number,y:number}} p
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {{x:number,y:number}}
 */
function closestPointOnSegment(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denominator = abx * abx + aby * aby;
  if (denominator <= 0.0001) return { x: a.x, y: a.y };

  const t = clamp(
    ((p.x - a.x) * abx + (p.y - a.y) * aby) / denominator,
    0,
    1
  );
  return { x: a.x + abx * t, y: a.y + aby * t };
}

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {{x:number,y:number}} c
 * @param {{x:number,y:number}} d
 * @returns {boolean}
 */
function segmentsIntersect(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

/**
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @param {{x:number,y:number}} c
 * @returns {number}
 */
function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/**
 * @param {PointerEvent} event
 */
function onGraphPointerDown(event) {
  if (
    appState.mode !== 'play' ||
    appState.screen !== 'game' ||
    appState.playVariant !== 'analysis' ||
    !analysisGraphSvg
  ) {
    return;
  }
  if (isAnalysisTransferAnimating()) return;
  clearAnalysisMixFeedback();
  const selectionCleared = setSelectedBlobKey(null);

  const target = event.target;
  if (!(target instanceof Element)) {
    if (selectionCleared) {
      render();
    }
    return;
  }
  const nodeGroup = target.closest('.graph-node');
  if (!nodeGroup) {
    if (selectionCleared) {
      render();
    }
    return;
  }
  const nodeKey = nodeGroup.getAttribute('data-node-key');
  if (!nodeKey) {
    if (selectionCleared) {
      render();
    }
    return;
  }

  const node = analysisGraphState.nodes.get(nodeKey);
  if (!node) {
    if (selectionCleared) {
      render();
    }
    return;
  }

  const point = svgPointFromClientForSvg(analysisGraphSvg, event.clientX, event.clientY);
  analysisGraphState.drag.active = true;
  analysisGraphState.drag.nodeKey = nodeKey;
  analysisGraphState.drag.pointerId = event.pointerId;
  analysisGraphState.drag.offsetX = point.x - node.x;
  analysisGraphState.drag.offsetY = point.y - node.y;
  analysisGraphState.drag.startX = node.x;
  analysisGraphState.drag.startY = node.y;
  node.pinned = true;

  analysisGraphSvg.setPointerCapture(event.pointerId);
  render();
  event.preventDefault();
}

/**
 * @param {PointerEvent} event
 */
function onGraphPointerMove(event) {
  if (!analysisGraphSvg) return;
  if (isAnalysisTransferAnimating()) return;
  if (!analysisGraphState.drag.active) {
    if (updateSelectionFromGraphTarget(event.target)) {
      render();
    }
    return;
  }
  if (analysisGraphState.drag.pointerId !== event.pointerId) return;

  const nodeKey = analysisGraphState.drag.nodeKey;
  if (!nodeKey) return;
  const node = analysisGraphState.nodes.get(nodeKey);
  if (!node) return;

  const clampedClient = clampClientPointToSvgRect(analysisGraphSvg, event.clientX, event.clientY);
  const point = svgPointFromClientForSvg(analysisGraphSvg, clampedClient.x, clampedClient.y);
  const clampedPosition = clampAnalysisGraphPosition(
    point.x - analysisGraphState.drag.offsetX,
    point.y - analysisGraphState.drag.offsetY
  );
  node.x = clampedPosition.x;
  node.y = clampedPosition.y;

  drawAnalysisGraph();
  event.preventDefault();
}

/**
 * @param {SVGSVGElement} svgEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x:number,y:number}}
 */
function clampClientPointToSvgRect(svgEl, clientX, clientY) {
  const rect = svgEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: clientX, y: clientY };
  }

  return {
    x: clamp(clientX, rect.left, rect.right),
    y: clamp(clientY, rect.top, rect.bottom)
  };
}

/**
 * @param {PointerEvent} event
 */
function onGraphPointerLeave(event) {
  if (!isAnalysisSelectionActive()) return;
  if (analysisGraphState.drag.active) return;

  if (setSelectedBlobKey(null)) {
    render();
  }
}

/**
 * @param {PointerEvent} event
 */
async function onGraphPointerUp(event) {
  if (!analysisGraphSvg) return;
  if (isAnalysisTransferAnimating()) return;
  if (!analysisGraphState.drag.active) return;
  if (analysisGraphState.drag.pointerId !== event.pointerId) return;

  const draggedNodeKey = analysisGraphState.drag.nodeKey;
  const dragStartX = analysisGraphState.drag.startX;
  const dragStartY = analysisGraphState.drag.startY;
  const draggedNode = draggedNodeKey
    ? analysisGraphState.nodes.get(draggedNodeKey)
    : null;
  const dragDistance = draggedNode
    ? Math.hypot(
        draggedNode.x - dragStartX,
        draggedNode.y - dragStartY
      )
    : 0;

  if (analysisGraphSvg.hasPointerCapture(event.pointerId)) {
    analysisGraphSvg.releasePointerCapture(event.pointerId);
  }
  analysisGraphState.drag.active = false;
  analysisGraphState.drag.nodeKey = null;
  analysisGraphState.drag.pointerId = null;
  analysisGraphState.drag.startX = 0;
  analysisGraphState.drag.startY = 0;

  const droppedOnKey =
    draggedNodeKey && dragDistance >= DRAG_DISTANCE_THRESHOLD
      ? findOverlappedAnalysisNodeKey(draggedNodeKey)
      : null;
  if (draggedNodeKey && droppedOnKey) {
    const droppedSourceNode = analysisGraphState.nodes.get(draggedNodeKey);
    const droppedTargetNode = analysisGraphState.nodes.get(droppedOnKey);
    const canLegallyMix = Boolean(
      droppedSourceNode &&
      droppedTargetNode &&
      mix(droppedSourceNode.color, droppedTargetNode.color)
    );

    if (!canLegallyMix) {
      showAnalysisMixFeedback('Move failed: those blob colors cannot legally mix.');
      if (draggedNode) {
        const resetPosition = clampAnalysisGraphPosition(
          dragStartX,
          dragStartY
        );
        draggedNode.x = resetPosition.x;
        draggedNode.y = resetPosition.y;
      }
    } else {
      const movedCount = await runAnalysisBlobTransfer(draggedNodeKey, droppedOnKey);
      if (movedCount <= 0 && draggedNode) {
        showAnalysisMixFeedback(
          'Move failed: no safe tile transfer exists for those blobs (it would orphan a blob).'
        );
        const resetPosition = clampAnalysisGraphPosition(
          dragStartX,
          dragStartY
        );
        draggedNode.x = resetPosition.x;
        draggedNode.y = resetPosition.y;
      } else if (movedCount > 0) {
        clearAnalysisMixFeedback();
      }
    }
  }

  render();
}

/**
 * @param {PointerEvent} event
 */
function onGraphPointerCancel(event) {
  if (!analysisGraphSvg) return;
  if (isAnalysisTransferAnimating()) return;
  if (!analysisGraphState.drag.active) return;

  if (
    analysisGraphState.drag.pointerId !== null &&
    analysisGraphSvg.hasPointerCapture(analysisGraphState.drag.pointerId)
  ) {
    analysisGraphSvg.releasePointerCapture(analysisGraphState.drag.pointerId);
  }

  analysisGraphState.drag.active = false;
  analysisGraphState.drag.nodeKey = null;
  analysisGraphState.drag.pointerId = null;
  analysisGraphState.drag.startX = 0;
  analysisGraphState.drag.startY = 0;
  render();
}

/**
 * @param {string} sourceBlobKey
 * @returns {string|null}
 */
function findOverlappedAnalysisNodeKey(sourceBlobKey) {
  const sourceNode = analysisGraphState.nodes.get(sourceBlobKey);
  if (!sourceNode) return null;

  let nearestKey = null;
  let nearestDistance = Infinity;
  const overlapThreshold = ANALYSIS_GRAPH_NODE_RADIUS * 2 + 4;

  for (const node of analysisGraphState.nodes.values()) {
    if (node.key === sourceBlobKey) continue;
    const distance = Math.hypot(node.x - sourceNode.x, node.y - sourceNode.y);
    if (distance > overlapThreshold) continue;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestKey = node.key;
    }
  }

  return nearestKey;
}

/**
 * @param {string} sourceBlobKey
 * @param {string} targetBlobKey
 * @returns {Promise<number>}
 */
async function runAnalysisBlobTransfer(sourceBlobKey, targetBlobKey) {
  if (sourceBlobKey === targetBlobKey) return 0;
  if (appState.playVariant !== 'analysis') return 0;
  if (isAnalysisTransferAnimating()) return 0;

  const sourceNode = analysisGraphState.nodes.get(sourceBlobKey);
  const targetNode = analysisGraphState.nodes.get(targetBlobKey);
  if (!sourceNode || !targetNode) return 0;

  const mixedColor = mix(sourceNode.color, targetNode.color);
  if (!mixedColor) return 0;

  const sourceMembers = analysisGraphState.blobMembers.get(sourceBlobKey) || [];
  const targetMembers = analysisGraphState.blobMembers.get(targetBlobKey) || [];
  if (sourceMembers.length === 0 || targetMembers.length === 0) return 0;

  const plan = buildAnalysisBlobTransferPlan(
    state.tiles,
    sourceMembers,
    targetMembers,
    sourceNode.color,
    targetNode.color,
    mixedColor
  );
  if (plan.length === 0) return 0;

  let movedCount = 0;
  let nextTiles = [...state.tiles];
  analysisTransferState.active = true;

  try {
    for (const step of plan) {
      const animated = await animateAnalysisBlobTransferStep(
        step.sourceIndex,
        sourceNode.color,
        step.path
      );
      if (!animated) break;

      if (movedCount === 0) {
        state.history.push({
          tiles: [...state.tiles]
        });
      }

      nextTiles = applyAnalysisBlobTransferMove(
        nextTiles,
        step.sourceIndex,
        step.targetIndex,
        mixedColor
      );
      state.tiles = nextTiles;
      movedCount += 1;
      render();

      const keepGoing = await waitForAnalysisTransferMs(ANALYSIS_TRANSFER_PAUSE_MS);
      clearDemoAnimation();
      render();
      if (!keepGoing) break;
    }
  } finally {
    clearDemoAnimation();
    analysisTransferState.active = false;
  }

  if (movedCount > 0) {
    setSelectedBlobKey(null);
    hideMoveError(true);
    updateNoLegalMovesState();
  }

  return movedCount;
}

/**
 * @param {number} sourceIndex
 * @param {TileColor} sourceColor
 * @param {number[]} path
 * @returns {Promise<boolean>}
 */
async function animateAnalysisBlobTransferStep(sourceIndex, sourceColor, path) {
  if (path.length < 2) return false;
  if (!isAnalysisTransferAnimating()) return false;

  const sourcePoint = getTileCenter(sourceIndex);
  setDemoAnimation(sourceIndex, sourceColor, sourcePoint.x, sourcePoint.y);
  render();

  let currentPoint = sourcePoint;
  for (const tileIndex of path.slice(1)) {
    const destination = getTileCenter(tileIndex);
    const moved = await tweenAnalysisTransferPosition(
      currentPoint,
      destination,
      ANALYSIS_TRANSFER_HOP_MS
    );
    if (!moved) return false;
    currentPoint = destination;
  }

  return true;
}

/**
 * @param {{x:number,y:number}} from
 * @param {{x:number,y:number}} to
 * @param {number} durationMs
 * @returns {Promise<boolean>}
 */
function tweenAnalysisTransferPosition(from, to, durationMs) {
  return new Promise((resolve) => {
    const startedAt = performance.now();

    /**
     * @param {number} now
     */
    function frame(now) {
      if (!isAnalysisTransferAnimating()) {
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
 * @returns {Promise<boolean>}
 */
function waitForAnalysisTransferMs(ms) {
  return new Promise((resolve) => {
    window.setTimeout(() => {
      resolve(isAnalysisTransferAnimating());
    }, ms);
  });
}

/**
 * @param {TileColor[]} baseTiles
 * @param {number[]} sourceMembers
 * @param {number[]} targetMembers
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @param {TileColor} mixedColor
 * @returns {Array<{sourceIndex:number,targetIndex:number,path:number[]}>}
 */
function buildAnalysisBlobTransferPlan(
  baseTiles,
  sourceMembers,
  targetMembers,
  sourceColor,
  targetColor,
  mixedColor
) {
  const initialStrandedCount = countStrandedAnalysisBlobs(baseTiles);
  /** @type {Map<string,Array<{sourceIndex:number,targetIndex:number,path:number[]}>>} */
  const memo = new Map();

  /**
   * @param {TileColor[]} tiles
   * @param {number[]} remainingSources
   * @param {number[]} remainingTargets
   * @param {number} strandedCount
   * @returns {Array<{sourceIndex:number,targetIndex:number,path:number[]}>}
   */
  function dfs(tiles, remainingSources, remainingTargets, strandedCount) {
    if (remainingSources.length === 0 || remainingTargets.length === 0) {
      return [];
    }

    const sourceKey = remainingSources.join(',');
    const targetKey = remainingTargets.join(',');
    const memoKey = `${sourceKey}|${targetKey}|${strandedCount}`;
    const cached = memo.get(memoKey);
    if (cached) return cached;

    /** @type {Array<{sourceIndex:number,targetIndex:number,path:number[]}>} */
    let bestPlan = [];
    const optimisticMax = Math.min(remainingSources.length, remainingTargets.length);

    for (const sourceIndex of remainingSources) {
      for (const targetIndex of remainingTargets) {
        const path = findColorConstrainedPath(
          sourceIndex,
          targetIndex,
          sourceColor,
          targetColor,
          tiles
        );
        if (!path || path.length < 2) continue;

        const nextTiles = applyAnalysisBlobTransferMove(
          tiles,
          sourceIndex,
          targetIndex,
          mixedColor
        );
        const nextStranded = countStrandedAnalysisBlobs(nextTiles);
        if (nextStranded > strandedCount) continue;

        const nextSources = remainingSources.filter((index) => index !== sourceIndex);
        const nextTargets = remainingTargets.filter((index) => index !== targetIndex);
        const suffix = dfs(nextTiles, nextSources, nextTargets, nextStranded);
        const candidate = [{ sourceIndex, targetIndex, path }, ...suffix];

        if (
          candidate.length > bestPlan.length ||
          (candidate.length === bestPlan.length &&
            isLexicographicallySmallerTransferPlan(candidate, bestPlan))
        ) {
          bestPlan = candidate;
        }

        if (bestPlan.length >= optimisticMax) {
          memo.set(memoKey, bestPlan);
          return bestPlan;
        }
      }
    }

    memo.set(memoKey, bestPlan);
    return bestPlan;
  }

  const normalizedSources = sourceMembers.filter(
    (index) => baseTiles[index] === sourceColor
  );
  const normalizedTargets = targetMembers.filter(
    (index) => baseTiles[index] === targetColor
  );

  return dfs(
    [...baseTiles],
    normalizedSources,
    normalizedTargets,
    initialStrandedCount
  );
}

/**
 * @param {Array<{sourceIndex:number,targetIndex:number,path:number[]}>} a
 * @param {Array<{sourceIndex:number,targetIndex:number,path:number[]}>} b
 * @returns {boolean}
 */
function isLexicographicallySmallerTransferPlan(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const sourceDiff = a[i].sourceIndex - b[i].sourceIndex;
    if (sourceDiff !== 0) return sourceDiff < 0;
    const targetDiff = a[i].targetIndex - b[i].targetIndex;
    if (targetDiff !== 0) return targetDiff < 0;
  }
  return a.length < b.length;
}

/**
 * @param {TileColor[]} tiles
 * @param {number} sourceIndex
 * @param {number} targetIndex
 * @param {TileColor} mixedColor
 * @returns {TileColor[]}
 */
function applyAnalysisBlobTransferMove(
  tiles,
  sourceIndex,
  targetIndex,
  mixedColor
) {
  const nextTiles = [...tiles];
  nextTiles[sourceIndex] = 'white';
  nextTiles[targetIndex] = mixedColor;
  return nextTiles;
}

/**
 * @param {TileColor[]} tiles
 * @returns {number}
 */
function countStrandedAnalysisBlobs(tiles) {
  const graphData = buildBlobGraphData(tiles);
  if (graphData.blobs.length === 0) return 0;

  const colorByBlobKey = new Map(
    graphData.blobs.map((blob) => [blob.key, blob.color])
  );
  /** @type {Map<string,Set<TileColor>>} */
  const adjacentColorsByBlobKey = new Map(
    graphData.blobs.map((blob) => [blob.key, new Set()])
  );

  for (const [aKey, bKey] of graphData.edges) {
    const aColor = colorByBlobKey.get(aKey);
    const bColor = colorByBlobKey.get(bKey);
    if (aColor) {
      adjacentColorsByBlobKey.get(bKey)?.add(aColor);
    }
    if (bColor) {
      adjacentColorsByBlobKey.get(aKey)?.add(bColor);
    }
  }

  let strandedCount = 0;
  for (const blob of graphData.blobs) {
    const adjacentColors = adjacentColorsByBlobKey.get(blob.key);
    let hasLegalNeighbor = false;
    if (adjacentColors) {
      for (const neighborColor of adjacentColors) {
        if (mix(blob.color, neighborColor)) {
          hasLegalNeighbor = true;
          break;
        }
      }
    }

    if (!hasLegalNeighbor) {
      strandedCount += 1;
    }
  }

  return strandedCount;
}

function renderAnalysisStatus() {
  const analysisActive =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';
  const counts = getAnalysisPrimaryCounts();

  if (analysisSessionState.selectedColor) {
    const selected = analysisSessionState.selectedColor;
    if (
      (selected === 'red' || selected === 'blue' || selected === 'yellow') &&
      counts[selected] >= 20
    ) {
      analysisSessionState.selectedColor = null;
      resetAnalysisPaintState();
    }
  }

  for (const swatch of analysisSwatches) {
    const color = swatch.getAttribute('data-color');
    if (color !== 'red' && color !== 'blue' && color !== 'yellow') continue;

    const countEl = swatch.querySelector('.analysis-swatch-count');
    if (countEl) {
      countEl.textContent = String(counts[color]);
    }

    const atLimit = counts[color] >= 20;
    swatch.disabled = atLimit;
    swatch.classList.toggle('limit-reached', atLimit);
    const isSelected =
      analysisActive && analysisSessionState.selectedColor === color && !atLimit;
    swatch.classList.toggle('selected', isSelected);
    swatch.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  }

  updateAnalysisPaintCursor();
}

function updateAnalysisPaintCursor() {
  if (!gameScreen) return;

  const isAnalysisActive =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';
  const selectedColor = analysisSessionState.selectedColor;
  const hasSelectedPrimaryColor =
    selectedColor === 'red' || selectedColor === 'blue' || selectedColor === 'yellow';
  const useCursor = isAnalysisActive && hasSelectedPrimaryColor;

  gameScreen.classList.toggle('analysis-cursor-active', useCursor);
  if (!useCursor) {
    gameScreen.style.removeProperty('--analysis-cursor');
    return;
  }

  gameScreen.style.setProperty(
    '--analysis-cursor',
    getAnalysisColorCursor(/** @type {'red'|'blue'|'yellow'} */ (selectedColor))
  );
}

/**
 * @param {'red'|'blue'|'yellow'} color
 * @returns {string}
 */
function getAnalysisColorCursor(color) {
  const cached = analysisCursorCache.get(color);
  if (cached) return cached;

  const fill = COLOR_HEX[color];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22"><polygon points="11,1.5 18.7,6 18.7,16 11,20.5 3.3,16 3.3,6" fill="${fill}" stroke="#152128" stroke-width="1.4"/></svg>`;
  const encoded = encodeURIComponent(svg);
  const cursor = `url("data:image/svg+xml,${encoded}") 11 11, crosshair`;
  analysisCursorCache.set(color, cursor);
  return cursor;
}

/**
 * @param {Event} event
 * @returns {boolean}
 */
function isEventInsideAnalysisFillControls(event) {
  const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
  for (const entry of path) {
    if (!(entry instanceof Element)) continue;
    if (entry === boardSvg) return true;
    if (entry === analysisPalette) return true;
    if (entry.closest?.('#board')) return true;
    if (entry.closest?.('.analysis-swatch')) return true;
  }
  return false;
}

function isAnalysisBoardPaintArmed() {
  return (
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis' &&
    (analysisSessionState.selectedColor === 'red' ||
      analysisSessionState.selectedColor === 'blue' ||
      analysisSessionState.selectedColor === 'yellow')
  );
}

/**
 * @param {number} pointerId
 */
function beginAnalysisPaintStroke(pointerId) {
  analysisSessionState.paint.active = true;
  analysisSessionState.paint.pointerId = pointerId;
  analysisSessionState.paint.didPaint = false;
  analysisSessionState.paint.lastTileIndex = null;
}

function resetAnalysisPaintState() {
  analysisSessionState.paint.active = false;
  analysisSessionState.paint.pointerId = null;
  analysisSessionState.paint.didPaint = false;
  analysisSessionState.paint.lastTileIndex = null;
}

/**
 * @param {number|null} pointerId
 */
function endAnalysisPaintStroke(pointerId) {
  if (pointerId !== null && boardSvg.hasPointerCapture(pointerId)) {
    boardSvg.releasePointerCapture(pointerId);
  }
  resetAnalysisPaintState();
}

/**
 * @param {number} tileIndex
 * @returns {boolean}
 */
function paintAnalysisTile(tileIndex) {
  const selectedColor = analysisSessionState.selectedColor;
  if (
    selectedColor !== 'red' &&
    selectedColor !== 'blue' &&
    selectedColor !== 'yellow'
  ) {
    return false;
  }
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return false;
  if (analysisSessionState.paint.lastTileIndex === tileIndex) return false;
  analysisSessionState.paint.lastTileIndex = tileIndex;
  if (state.tiles[tileIndex] !== 'white') return false;

  const counts = getAnalysisPrimaryCounts();
  if (counts[selectedColor] >= 20) {
    analysisSessionState.selectedColor = null;
    resetAnalysisPaintState();
    return false;
  }

  if (!analysisSessionState.paint.didPaint) {
    state.history.push({
      tiles: [...state.tiles]
    });
    analysisSessionState.paint.didPaint = true;
  }

  state.tiles[tileIndex] = selectedColor;
  updateNoLegalMovesState();
  hideMoveError(true);

  const updatedCounts = getAnalysisPrimaryCounts();
  if (updatedCounts[selectedColor] >= 20) {
    analysisSessionState.selectedColor = null;
    resetAnalysisPaintState();
  }
  return true;
}

/**
 * @returns {{red:number,blue:number,yellow:number}}
 */
function getAnalysisPrimaryCounts() {
  return state.tiles.reduce(
    (acc, tile) => {
      if (tile === 'red' || tile === 'blue' || tile === 'yellow') {
        acc[tile] += 1;
      }
      return acc;
    },
    { red: 0, blue: 0, yellow: 0 }
  );
}

function renderNoMovesNotice() {
  if (!noMovesNoticeEl) return;

  const score = state.tiles.reduce((acc, tile) => (tile === 'white' ? acc + 1 : acc), 0);
  const clearedBoard = score === 60;
  const isEmptyAnalysisBoard = appState.playVariant === 'analysis' && clearedBoard;
  const shouldShow =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    noLegalMovesLeft &&
    !isEmptyAnalysisBoard;

  if (shouldShow) {
    noMovesNoticeEl.textContent = clearedBoard
      ? 'Congratulations, you cleared the board!'
      : 'There are no legal moves left!';
  }

  noMovesNoticeEl.classList.toggle('hidden', !shouldShow);
}

/**
 * @param {number} tileIndex
 * @returns {boolean}
 */
function isSelectedBoardTileInAnalysisBlob(tileIndex) {
  if (
    appState.mode !== 'play' ||
    appState.screen !== 'game' ||
    appState.playVariant !== 'analysis'
  ) {
    return false;
  }

  const selectedKey = analysisGraphState.selectedBlobKey;
  if (!selectedKey) return false;
  return analysisGraphState.tileToBlob[tileIndex] === selectedKey;
}

/**
 * @param {string|null} blobKey
 * @returns {boolean}
 */
function setSelectedBlobKey(blobKey) {
  const normalizedBlobKey = blobKey ?? null;
  if (analysisGraphState.selectedBlobKey === normalizedBlobKey) {
    return false;
  }
  analysisGraphState.selectedBlobKey = normalizedBlobKey;
  return true;
}

/**
 * @returns {boolean}
 */
function isAnalysisSelectionActive() {
  return (
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis'
  );
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function updateSelectionFromBoardTarget(target) {
  if (!isAnalysisSelectionActive()) return false;
  if (!(target instanceof Element)) return setSelectedBlobKey(null);

  const tileGroup = target.closest('.tile-group');
  if (!tileGroup) return setSelectedBlobKey(null);

  const tileIndex = Number(tileGroup.getAttribute('data-index'));
  if (!Number.isInteger(tileIndex)) return setSelectedBlobKey(null);

  return setSelectedBlobKey(getBlobKeyForTileIndex(tileIndex));
}

/**
 * @param {EventTarget|null} target
 * @returns {boolean}
 */
function updateSelectionFromGraphTarget(target) {
  if (!isAnalysisSelectionActive()) return false;
  if (!(target instanceof Element)) return setSelectedBlobKey(null);

  const nodeGroup = target.closest('.graph-node');
  const nodeKey = nodeGroup?.getAttribute('data-node-key') ?? null;
  return setSelectedBlobKey(nodeKey);
}

/**
 * @param {number} tileIndex
 * @returns {string|null}
 */
function getBlobKeyForTileIndex(tileIndex) {
  if (tileIndex < 0 || tileIndex >= state.tiles.length) return null;
  const color = state.tiles[tileIndex];
  if (color === 'white') return null;

  const cached = analysisGraphState.tileToBlob[tileIndex];
  if (cached) return cached;

  return computeBlobKeyFromTile(tileIndex, state.tiles);
}

/**
 * @param {number} tileIndex
 * @param {TileColor[]} tiles
 * @returns {string|null}
 */
function computeBlobKeyFromTile(tileIndex, tiles) {
  const color = tiles[tileIndex];
  if (color === 'white') return null;

  const visited = new Set([tileIndex]);
  const stack = [tileIndex];
  /** @type {number[]} */
  const members = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    members.push(current);

    for (const neighbor of getNeighbors(current)) {
      if (visited.has(neighbor)) continue;
      if (tiles[neighbor] !== color) continue;
      visited.add(neighbor);
      stack.push(neighbor);
    }
  }

  members.sort((a, b) => a - b);
  return members.join('-');
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
    group.classList.toggle('selected-blob', isSelectedBoardTileInAnalysisBlob(idx));
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

  if (state.dragState.sourceColor === null) return;

  if (state.dragState.sourceType === 'palette') {
    const draggedPoly = getDraggedInnerPolygon();
    const piece = createSvgEl('polygon', {
      class: 'drag-inner',
      points: pointsToAttr(draggedPoly),
      fill: COLOR_HEX[state.dragState.sourceColor]
    });
    dragLayer.appendChild(piece);
    return;
  }

  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null) return;

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
  if (appState.playVariant !== 'analysis') {
    updateBestScore(score);
  }
}

function updateUndoCount() {
  if (!undoCountValueEl) return;
  undoCountValueEl.textContent = String(undoCount);
}

/**
 * @returns {boolean}
 */
function readAnalysisUnlocked() {
  try {
    if (window.location.protocol === 'file:') return true;
    const path = window.location.pathname || '';
    if (path.endsWith('/Analysis') || path.endsWith('/Analysis/')) {
      return true;
    }
    const params = new URLSearchParams(window.location.search);
    return params.get('analysis') === '1';
  } catch {
    return false;
  }
}

/**
 * @returns {number|null}
 */
function readBestScore() {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * @param {number} score
 */
function updateBestScore(score) {
  if (score > 0 && (bestScore === null || score > bestScore)) {
    bestScore = score;
    try {
      window.localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(score));
    } catch {
      // Ignore storage failures (private mode / disabled storage).
    }
  }

  if (!bestScoreValueEl) return;
  bestScoreValueEl.textContent = bestScore === null ? 'No score yet' : String(bestScore);
}

function updateUndoButtonState() {
  if (!undoBtn) return;

  const enabled =
    appState.mode === 'play' &&
    state.history.length > 0 &&
    !isAnalysisTransferAnimating();
  undoBtn.disabled = !enabled;
}

function updateClearBoardButtonState() {
  if (!clearBoardBtn) return;

  const analysisActive =
    appState.mode === 'play' &&
    appState.screen === 'game' &&
    appState.playVariant === 'analysis';
  const hasFilledTiles = getColoredTileCount(state.tiles) > 0;
  clearBoardBtn.disabled =
    !analysisActive || !hasFilledTiles || isAnalysisTransferAnimating();
}

/** @returns {{x:number,y:number}[]} */
function getDraggedInnerPolygon() {
  if (state.dragState.sourceType === 'palette') {
    return hexPoints(state.dragState.pointerX, state.dragState.pointerY, INNER_RADIUS);
  }

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
 * @param {number} index
 * @returns {{x:number,y:number}[]}
 */
function getOuterPolygonAtIndex(index) {
  const tile = tilesMeta[index];
  return hexPoints(tile.cx, tile.cy, HEX_RADIUS);
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
  return svgPointFromClientForSvg(boardSvg, clientX, clientY);
}

/**
 * @param {SVGSVGElement} svgEl
 * @param {number} clientX
 * @param {number} clientY
 * @returns {{x:number,y:number}}
 */
function svgPointFromClientForSvg(svgEl, clientX, clientY) {
  const pt = svgEl.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const transformed = pt.matrixTransform(svgEl.getScreenCTM().inverse());
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
 * @param {PointerEvent} event
 * @returns {number|null}
 */
function getBoardTileIndexFromPointerEvent(event) {
  const directIndex = readIndexFromEvent(event);
  if (directIndex !== null) {
    return directIndex;
  }

  const point = svgPointFromClient(event.clientX, event.clientY);
  for (const tile of tilesMeta) {
    const polygon = hexPoints(tile.cx, tile.cy, INNER_RADIUS);
    if (isPointInPolygon(point, polygon)) {
      return tile.index;
    }
  }
  return null;
}

/**
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}[]} polygon
 * @returns {boolean}
 */
function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
