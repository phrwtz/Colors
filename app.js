/** @typedef {'red'|'blue'|'yellow'|'purple'|'green'|'orange'|'white'} TileColor */

const ROW_LENGTHS = [8, 7, 8, 7, 8, 7, 8, 7];
const PRIMARY_COLORS = new Set(['red', 'blue', 'yellow']);
const MIXED_COLORS = new Set(['purple', 'green', 'orange']);
const SVG_NS = 'http://www.w3.org/2000/svg';

const HEX_RADIUS = 34;
const INNER_RADIUS = 26;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const ROW_SPACING = 1.5 * HEX_RADIUS;
const BOARD_PADDING = HEX_RADIUS + 10;
const TILE_SELECTION_OVERLAP_THRESHOLD = 0.6;
const DROP_CONTAINMENT_THRESHOLD = TILE_SELECTION_OVERLAP_THRESHOLD;
const DRAG_DISTANCE_THRESHOLD = 6;

const COLOR_HEX = {
  red: '#d94037',
  blue: '#2763d8',
  yellow: '#f7dc52',
  purple: '#b58ae0',
  green: '#2fa36b',
  orange: '#f29b5f',
  white: '#ffffff'
};

const MIX_RESULTS = {
  'blue:red': 'purple',
  'red:blue': 'purple',
  'yellow:red': 'orange',
  'red:yellow': 'orange',
  'blue:yellow': 'green',
  'yellow:blue': 'green',
  'blue:orange': 'white',
  'orange:blue': 'white',
  'red:green': 'white',
  'green:red': 'white',
  'yellow:purple': 'white',
  'purple:yellow': 'white'
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
 * @property {boolean} insideContainer
 * @property {number[]} passedTiles
 * @property {TileColor|null} pathColor
 * @property {Set<TileColor>} touchedTargetColors
 * @property {boolean} touchedIllegalColor
 * @property {boolean} touchedWhite
 * @property {boolean} touchedMultipleTargetColors
 */

/**
 * @typedef {Object} GameSnapshot
 * @property {TileColor[]} tiles
 * @property {number} score
 */

/**
 * @typedef {Object} GameState
 * @property {TileColor[]} tiles
 * @property {TileColor[]} initialTiles
 * @property {DragState} dragState
 * @property {number} score
 * @property {GameSnapshot[]} history
 */

const boardSvg = document.getElementById('board');
const controlsEl = document.querySelector('.controls');
const instructionsBtn = document.getElementById('instructions-btn');
const instructionsModal = document.getElementById('instructions-modal');
const instructionsCloseBtn = document.getElementById('instructions-close-btn');
let undoBtn = document.getElementById('undo-btn');
const resetBtn = document.getElementById('reset-btn');
const newBoardBtn = document.getElementById('new-board-btn');
const scoreValueEl = document.getElementById('score-value');
const moveErrorModal = document.getElementById('move-error-modal');
const moveErrorText = document.getElementById('move-error-text');

if (!undoBtn && controlsEl) {
  undoBtn = document.createElement('button');
  undoBtn.id = 'undo-btn';
  undoBtn.type = 'button';
  undoBtn.textContent = 'Undo';
  if (resetBtn) {
    controlsEl.insertBefore(undoBtn, resetBtn);
  } else {
    controlsEl.prepend(undoBtn);
  }
}

const tilesMeta = buildTileMeta();
const indexByRowCol = new Map(tilesMeta.map((tile) => [keyOf(tile.row, tile.col), tile.index]));

const boardPixelWidth = BOARD_PADDING * 2 + HEX_WIDTH * 8.5;
const boardPixelHeight = BOARD_PADDING * 2 + HEX_RADIUS * 2 + ROW_SPACING * (ROW_LENGTHS.length - 1);
boardSvg.setAttribute('viewBox', `0 0 ${boardPixelWidth} ${boardPixelHeight}`);

const outerLayer = createSvgEl('g', { id: 'outer-layer' });
const innerLayer = createSvgEl('g', { id: 'inner-layer' });
const previewLayer = createSvgEl('g', { id: 'preview-layer' });
const dragLayer = createSvgEl('g', { id: 'drag-layer' });
boardSvg.append(outerLayer, innerLayer, dragLayer, previewLayer);

/** @type {GameState} */
const state = {
  tiles: createShuffledBoard(),
  initialTiles: [],
  dragState: createEmptyDragState(),
  score: 0,
  history: []
};
state.initialTiles = [...state.tiles];

initializeBoardStatic();
render();

boardSvg.addEventListener('pointerdown', onPointerDown);
boardSvg.addEventListener('pointermove', onPointerMove);
boardSvg.addEventListener('pointerup', onPointerUp);
boardSvg.addEventListener('pointercancel', cancelDrag);
boardSvg.addEventListener('lostpointercapture', cancelDrag);

if (instructionsBtn && instructionsModal) {
  instructionsBtn.addEventListener('click', () => {
    if (typeof instructionsModal.showModal === 'function') {
      instructionsModal.showModal();
    } else {
      instructionsModal.setAttribute('open', '');
    }
  });
}

if (instructionsCloseBtn && instructionsModal) {
  instructionsCloseBtn.addEventListener('click', () => {
    if (typeof instructionsModal.close === 'function') {
      instructionsModal.close();
    } else {
      instructionsModal.removeAttribute('open');
    }
  });
}

if (instructionsModal) {
  instructionsModal.addEventListener('click', (event) => {
    const rect = instructionsModal.getBoundingClientRect();
    const clickedOutside =
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom;
    if (!clickedOutside) return;

    if (typeof instructionsModal.close === 'function') {
      instructionsModal.close();
    } else {
      instructionsModal.removeAttribute('open');
    }
  });
}

if (undoBtn) {
  undoBtn.addEventListener('click', () => {
    if (state.history.length === 0) return;
    const previous = state.history.pop();
    state.tiles = [...previous.tiles];
    state.score = previous.score;
    state.dragState = createEmptyDragState();
    render();
  });
}

resetBtn.addEventListener('click', () => {
  state.tiles = [...state.initialTiles];
  state.dragState = createEmptyDragState();
  state.score = 0;
  state.history = [];
  render();
});

newBoardBtn.addEventListener('click', () => {
  const fresh = createShuffledBoard();
  state.tiles = [...fresh];
  state.initialTiles = [...fresh];
  state.dragState = createEmptyDragState();
  state.score = 0;
  state.history = [];
  render();
});

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
    insideContainer: false,
    passedTiles: [],
    pathColor: null,
    touchedTargetColors: new Set(),
    touchedIllegalColor: false,
    touchedWhite: false,
    touchedMultipleTargetColors: false
  };
}

/** @returns {TileColor[]} */
function createShuffledBoard() {
  /** @type {TileColor[]} */
  const colors = [];
  for (let i = 0; i < 20; i += 1) {
    colors.push('red', 'blue', 'yellow');
  }

  for (let i = colors.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [colors[i], colors[j]] = [colors[j], colors[i]];
  }

  return colors;
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
function isMixed(color) {
  return MIXED_COLORS.has(color);
}

/**
 * @param {TileColor} color
 * @returns {boolean}
 */
function isMovable(color) {
  return isPrimary(color) || isMixed(color);
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @returns {boolean}
 */
function isEligibleTarget(sourceColor, targetColor) {
  return targetColor !== 'white' && mix(sourceColor, targetColor) !== null;
}

/**
 * @param {TileColor} sourceColor
 * @param {TileColor} targetColor
 * @returns {TileColor|null}
 */
function mix(sourceColor, targetColor) {
  const key = `${sourceColor}:${targetColor}`;
  return MIX_RESULTS[key] || null;
}

/**
 * @param {TileColor} sourceColor
 * @returns {Set<TileColor>}
 */
function getLegalTargetColors(sourceColor) {
  const legalColors = new Set();
  for (const key of Object.keys(MIX_RESULTS)) {
    const [source, target] = key.split(':');
    if (source === sourceColor) {
      legalColors.add(/** @type {TileColor} */ (target));
    }
  }
  return legalColors;
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
  if (!isMovable(source) || !isEligibleTarget(source, target)) return false;

  if (gameState.dragState.sourceIndex === sourceIndex) {
    if (!gameState.dragState.passedTiles.includes(targetIndex)) return false;
    if (gameState.dragState.pathColor !== null && target !== gameState.dragState.pathColor) return false;
    return true;
  }

  return getNeighbors(sourceIndex).includes(targetIndex);
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
  const sourceIndex = readIndexFromEvent(event);
  if (sourceIndex === null) return;

  const color = state.tiles[sourceIndex];
  if (!isMovable(color)) return;

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
  if (state.dragState.sourceIndex === null) return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;

  updateHoverTarget();
  trackDragViolations();
  render();
}

/**
 * @param {PointerEvent} event
 */
function onPointerUp(event) {
  if (state.dragState.sourceIndex === null) return;

  const point = svgPointFromClient(event.clientX, event.clientY);
  state.dragState.pointerX = point.x;
  state.dragState.pointerY = point.y;
  updateHoverTarget();
  trackDragViolations();

  const sourceIndex = state.dragState.sourceIndex;
  const target = state.dragState.hoverTarget;
  const hasPathViolation =
    state.dragState.touchedWhite ||
    state.dragState.touchedIllegalColor ||
    state.dragState.touchedMultipleTargetColors;
  const canCommit =
    typeof target === 'number' &&
    canDrop(sourceIndex, target, state) &&
    state.dragState.overlapRatio >= DROP_CONTAINMENT_THRESHOLD &&
    !hasPathViolation;

  if (canCommit) {
    pushHistorySnapshot();
    const updated = applyMove(sourceIndex, target, state);
    state.score += countNewWhiteTiles(state.tiles, updated.tiles);
    state.tiles = updated.tiles;
    hideMoveError();
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
  if (state.dragState.sourceIndex === null) return;
  state.dragState = createEmptyDragState();
  render();
}

/**
 * @param {number[]} seeds
 * @param {TileColor} color
 * @param {TileColor[]} tiles
 * @returns {Set<number>}
 */
function collectConnectedByColor(seeds, color, tiles) {
  const connected = new Set();
  const queue = [];

  for (const idx of seeds) {
    if (!Number.isInteger(idx)) continue;
    if (idx < 0 || idx >= tiles.length) continue;
    if (tiles[idx] !== color) continue;
    if (connected.has(idx)) continue;
    connected.add(idx);
    queue.push(idx);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    const neighbors = getNeighbors(current);
    for (const next of neighbors) {
      if (tiles[next] !== color) continue;
      if (connected.has(next)) continue;
      connected.add(next);
      queue.push(next);
    }
  }

  return connected;
}

/**
 * @param {Set<number>} sourceComponent
 * @param {TileColor} sourceColor
 * @param {TileColor[]} tiles
 * @returns {Set<number>}
 */
function getAdjacentLegalTargets(sourceComponent, sourceColor, tiles) {
  const candidates = new Set();
  for (const idx of sourceComponent) {
    const neighbors = getNeighbors(idx);
    for (const next of neighbors) {
      if (sourceComponent.has(next)) continue;
      if (!isEligibleTarget(sourceColor, tiles[next])) continue;
      candidates.add(next);
    }
  }
  return candidates;
}

/**
 * @param {{x:number,y:number}[]} draggedPoly
 * @param {number} tileIndex
 * @returns {number}
 */
function overlapAreaOnTile(draggedPoly, tileIndex) {
  const targetPoly = getInnerPolygonAtIndex(tileIndex);
  const overlapPoly = clipPolygonConvex(draggedPoly, targetPoly);
  return Math.abs(polygonArea(overlapPoly));
}

/**
 * @param {{x:number,y:number}[]} draggedPoly
 * @param {number} tileIndex
 * @returns {number}
 */
function overlapRatioOnTile(draggedPoly, tileIndex) {
  const targetPoly = getInnerPolygonAtIndex(tileIndex);
  const overlapPoly = clipPolygonConvex(draggedPoly, targetPoly);
  const overlapArea = Math.abs(polygonArea(overlapPoly));
  const targetArea = Math.abs(polygonArea(targetPoly));
  if (targetArea <= 0) return 0;
  return overlapArea / targetArea;
}

function updateHoverTarget() {
  const sourceIndex = state.dragState.sourceIndex;
  const sourceColor = state.dragState.sourceColor;
  if (sourceIndex === null || sourceColor === null) {
    state.dragState.hoverTarget = null;
    state.dragState.containmentRatio = 0;
    state.dragState.overlapRatio = 0;
    state.dragState.insideContainer = false;
    state.dragState.passedTiles = [];
    state.dragState.pathColor = null;
    return;
  }

  const draggedPoly = getDraggedInnerPolygon();
  const draggedArea = Math.abs(polygonArea(draggedPoly));
  if (draggedArea <= 0) {
    state.dragState.hoverTarget = null;
    state.dragState.containmentRatio = 0;
    state.dragState.overlapRatio = 0;
    state.dragState.insideContainer = false;
    state.dragState.passedTiles = [];
    state.dragState.pathColor = null;
    return;
  }

  const sourceComponent = collectConnectedByColor([sourceIndex], sourceColor, state.tiles);
  const entryCandidates = getAdjacentLegalTargets(sourceComponent, sourceColor, state.tiles);

  /** @type {TileColor|null} */
  let pathColor = state.dragState.pathColor;
  if (pathColor === null) {
    let bestFirst = null;
    let bestArea = -1;
    for (const idx of entryCandidates) {
      const ratio = overlapRatioOnTile(draggedPoly, idx);
      if (ratio < TILE_SELECTION_OVERLAP_THRESHOLD) continue;
      const area = overlapAreaOnTile(draggedPoly, idx);
      if (area > bestArea) {
        bestArea = area;
        bestFirst = idx;
      }
    }

    if (bestFirst !== null) {
      pathColor = state.tiles[bestFirst];
    }
  }

  if (pathColor === null) {
    state.dragState.hoverTarget = null;
    state.dragState.containmentRatio = 0;
    state.dragState.overlapRatio = 0;
    state.dragState.insideContainer = false;
    state.dragState.passedTiles = [];
    state.dragState.pathColor = null;
    return;
  }

  const entryOfPathColor = [...entryCandidates].filter((idx) => state.tiles[idx] === pathColor);
  const pathRegion = collectConnectedByColor(entryOfPathColor, pathColor, state.tiles);
  const passedSet = new Set();

  let bestTarget = null;
  let bestContainment = 0;
  let bestOverlap = 0;
  let bestInsideContainer = false;

  for (const idx of pathRegion) {
    const targetPoly = getInnerPolygonAtIndex(idx);
    const clipped = clipPolygonConvex(draggedPoly, targetPoly);
    const overlapArea = Math.abs(polygonArea(clipped));

    if (overlapArea <= 0) continue;
    const targetArea = Math.abs(polygonArea(targetPoly));
    const overlapRatio = targetArea > 0 ? overlapArea / targetArea : 0;
    if (overlapRatio < TILE_SELECTION_OVERLAP_THRESHOLD) continue;
    passedSet.add(idx);

    const targetOuterPoly = getOuterPolygonAtIndex(idx);
    const insideContainer = polygonInsideConvex(draggedPoly, targetOuterPoly);

    const containment = overlapRatio;
    const isBetterCandidate =
      (insideContainer && !bestInsideContainer) ||
      (insideContainer === bestInsideContainer && containment > bestContainment);

    if (isBetterCandidate) {
      bestContainment = containment;
      bestOverlap = overlapArea / Math.abs(polygonArea(targetPoly));
      bestTarget = idx;
      bestInsideContainer = insideContainer;
    }
  }

  state.dragState.hoverTarget = bestTarget;
  state.dragState.containmentRatio = bestContainment;
  state.dragState.overlapRatio = bestOverlap;
  state.dragState.insideContainer = bestInsideContainer;
  state.dragState.passedTiles = [...passedSet];
  state.dragState.pathColor = pathColor;
}

function trackDragViolations() {
  const sourceIndex = state.dragState.sourceIndex;
  const sourceColor = state.dragState.sourceColor;
  if (sourceIndex === null || sourceColor === null) return;

  const draggedPoly = getDraggedInnerPolygon();
  const overlaps = getOverlappedTileIndices(draggedPoly, TILE_SELECTION_OVERLAP_THRESHOLD);
  if (overlaps.length === 0) return;

  const sourceComponent = collectConnectedByColor([sourceIndex], sourceColor, state.tiles);
  const legalTargetColors = getLegalTargetColors(sourceColor);

  for (const idx of overlaps) {
    if (sourceComponent.has(idx)) continue;

    const color = state.tiles[idx];
    if (color === 'white') {
      state.dragState.touchedWhite = true;
      continue;
    }

    state.dragState.touchedTargetColors.add(color);
    if (!legalTargetColors.has(color)) {
      state.dragState.touchedIllegalColor = true;
    }
  }

  state.dragState.touchedMultipleTargetColors = state.dragState.touchedTargetColors.size > 1;
}

/**
 * @param {number} sourceIndex
 * @returns {string}
 */
function getIllegalMoveMessage(sourceIndex) {
  const sourceColor = state.tiles[sourceIndex];
  const legalTargetColors = getLegalTargetColors(sourceColor);
  const releaseTile = getBestReleaseTile(sourceIndex);

  if (state.dragState.touchedMultipleTargetColors) {
    return 'You tried to drag your tile across more then one color.';
  }

  if (releaseTile !== null) {
    const releaseColor = state.tiles[releaseTile];
    if (releaseColor === 'white') {
      return 'You tried to drop your tile on a white tile.';
    }
    if (!legalTargetColors.has(releaseColor)) {
      return 'You tried to drop your tile on an an illegal color.';
    }
    if (state.dragState.overlapRatio < DROP_CONTAINMENT_THRESHOLD) {
      return 'You need to place the tile farther inside the target before dropping.';
    }
  }

  if (state.dragState.touchedWhite) {
    return 'You tried to drag your tile across a white tile.';
  }
  if (state.dragState.touchedIllegalColor) {
    return 'You tried to drag your tile across an illegal color.';
  }
  return 'That move is not legal.';
}

/**
 * @param {number} sourceIndex
 * @returns {number|null}
 */
function getBestReleaseTile(sourceIndex) {
  const draggedPoly = getDraggedInnerPolygon();
  const sourceColor = state.tiles[sourceIndex];
  const sourceComponent = collectConnectedByColor([sourceIndex], sourceColor, state.tiles);

  let bestIdx = null;
  let bestRatio = 0;

  for (const tile of tilesMeta) {
    const idx = tile.index;
    if (sourceComponent.has(idx)) continue;
    const ratio = overlapRatioOnTile(draggedPoly, idx);
    if (ratio < TILE_SELECTION_OVERLAP_THRESHOLD) continue;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

/**
 * @param {{x:number,y:number}[]} draggedPoly
 * @param {number} minOverlapRatio
 * @returns {number[]}
 */
function getOverlappedTileIndices(draggedPoly, minOverlapRatio) {
  const overlaps = [];
  for (const tile of tilesMeta) {
    const ratio = overlapRatioOnTile(draggedPoly, tile.index);
    if (ratio >= minOverlapRatio) {
      overlaps.push(tile.index);
    }
  }
  return overlaps;
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
  if (!moveErrorModal || !moveErrorText) return;
  moveErrorText.textContent = message;
  moveErrorModal.classList.remove('hidden');
}

function hideMoveError() {
  if (!moveErrorModal) return;
  moveErrorModal.classList.add('hidden');
}

function initializeBoardStatic() {
  outerLayer.innerHTML = '';
  innerLayer.innerHTML = '';

  for (const tile of tilesMeta) {
    const outerGroup = createSvgEl('g', {
      class: 'tile-shell',
      'data-index': String(tile.index)
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

function render() {
  renderScore();
  renderUndoState();
  renderTileSelection();
  renderInnerTiles();
  renderPreview();
  renderDragLayer();
}

function renderTileSelection() {
  const selected = new Set(state.dragState.passedTiles);
  const shells = outerLayer.querySelectorAll('.tile-shell');
  shells.forEach((shell) => {
    const idx = Number(shell.getAttribute('data-index'));
    shell.classList.toggle('moving-selected', selected.has(idx));
  });
}

function renderScore() {
  if (!scoreValueEl) return;
  scoreValueEl.textContent = String(state.score);
}

function renderUndoState() {
  if (!undoBtn) return;
  undoBtn.textContent = 'Undo';
  const disabled = state.history.length === 0;
  undoBtn.disabled = disabled;
}

function renderInnerTiles() {
  const sourceIndex = state.dragState.sourceIndex;

  const groups = innerLayer.querySelectorAll('.tile-group');
  groups.forEach((group) => {
    const idx = Number(group.getAttribute('data-index'));
    const color = state.tiles[idx];
    const inner = group.querySelector('.inner');

    const displayColor = sourceIndex === idx ? 'white' : color;
    inner.setAttribute('fill', COLOR_HEX[displayColor]);

    group.classList.toggle('draggable', isMovable(color));
    group.classList.toggle('dragging-source', sourceIndex === idx);
    group.setAttribute(
      'aria-label',
      `Row ${tilesMeta[idx].row + 1}, Column ${tilesMeta[idx].col + 1}, ${displayColor} tile`
    );
  });
}

function renderPreview() {
  previewLayer.innerHTML = '';

  const sourceIndex = state.dragState.sourceIndex;
  if (sourceIndex === null) return;

  const sourceColor = state.tiles[sourceIndex];
  const draggedPoly = getDraggedInnerPolygon();
  for (const idx of state.dragState.passedTiles) {
    const targetColor = state.tiles[idx];
    const mixed = mix(sourceColor, targetColor);
    if (!mixed) continue;

    const targetPoly = getInnerPolygonAtIndex(idx);
    const overlapPoly = clipPolygonConvex(draggedPoly, targetPoly);
    if (overlapPoly.length < 3) continue;

    const preview = createSvgEl('polygon', {
      class: 'overlap-preview',
      points: pointsToAttr(overlapPoly),
      fill: COLOR_HEX[mixed]
    });
    previewLayer.appendChild(preview);
  }
}

function renderDragLayer() {
  dragLayer.innerHTML = '';
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
 * @param {{x:number,y:number}[]} subject
 * @param {{x:number,y:number}[]} container
 * @returns {boolean}
 */
function polygonInsideConvex(subject, container) {
  if (subject.length < 3 || container.length < 3) return false;
  return subject.every((point) => pointInsideConvex(point, container));
}

/**
 * @param {{x:number,y:number}} point
 * @param {{x:number,y:number}[]} polygon
 * @returns {boolean}
 */
function pointInsideConvex(point, polygon) {
  const windingArea = polygonArea(polygon);
  const epsilon = 0.75;

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    if (windingArea >= 0) {
      if (cross < -epsilon) return false;
    } else if (cross > epsilon) {
      return false;
    }
  }

  return true;
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
 * @param {string} row
 * @param {string} col
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

/**
 * @param {TileColor[]} before
 * @param {TileColor[]} after
 * @returns {number}
 */
function countNewWhiteTiles(before, after) {
  let count = 0;
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== 'white' && after[i] === 'white') {
      count += 1;
    }
  }
  return count;
}

function pushHistorySnapshot() {
  state.history.push({
    tiles: [...state.tiles],
    score: state.score
  });
}
