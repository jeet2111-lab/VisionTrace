const canvas = document.getElementById('videoCanvas');
const ctx = canvas.getContext('2d');
const connStatus = document.getElementById('connStatus');
const alertBanner = document.getElementById('alertBanner');
const alertMessage = document.getElementById('alertMessage');
const logsContainer = document.getElementById('logsContainer');
const trackingBody = document.getElementById('trackingBody');

let ws;
const WS_URL = 'ws://localhost:8000/ws/stream';

let audioCtx = null;

function playAlertSound() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(440, audioCtx.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);

  gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);

  oscillator.start();
  oscillator.stop(audioCtx.currentTime + 0.5);
}

function connectWebSocket() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    connStatus.textContent = 'Connected';
    connStatus.style.backgroundColor = 'rgba(46, 160, 67, 0.2)';
    connStatus.style.color = 'var(--accent-green)';
  };

  ws.onclose = () => {
    connStatus.textContent = 'Disconnected - Retrying...';
    connStatus.style.backgroundColor = 'rgba(248, 81, 73, 0.2)';
    connStatus.style.color = 'var(--accent-red)';
    setTimeout(connectWebSocket, 3000);
  };

  let frameCount = 0;
  let lastFpsTime = performance.now();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    renderFrame(data.frame, data.tracking, data.density);
    handleAlerts(data.alerts);
    updateTrackingTable(data.tracking, data.alerts);
    if (data.density) updateDensity(data.density);

    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
      const fps = Math.round((frameCount * 1000) / (now - lastFpsTime));
      const fpsEl = document.getElementById('fpsCounter');
      if (fpsEl) fpsEl.textContent = `FPS: ${fps}`;
      frameCount = 0;
      lastFpsTime = now;
    }
  };
}

function renderFrame(base64Frame, tracking, density) {
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    if (isConfigMode) {
      drawPolygon(leftLanePoints, 'rgba(255, 255, 0, 0.6)');
      drawPolygon(rightLanePoints, 'rgba(0, 255, 255, 0.6)');
    } else if (density && density.type === 'polygon') {
      drawPolygon(density.left_polygon, 'rgba(255, 255, 0, 0.3)');
      drawPolygon(density.right_polygon, 'rgba(0, 255, 255, 0.3)');
    } else if (density) {
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(0, density.crop_y1); ctx.lineTo(canvas.width, density.crop_y1);
      ctx.moveTo(0, density.crop_y2); ctx.lineTo(canvas.width, density.crop_y2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(0, 255, 0, 0.4)';
      ctx.beginPath();
      ctx.moveTo(density.lane_threshold_x, density.crop_y1);
      ctx.lineTo(density.lane_threshold_x, density.crop_y2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    tracking.forEach(track => {
      const [x1, y1, x2, y2] = track.box;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x1, y1 - 20, 40, 20);
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 12px Arial';
      ctx.fillText(`ID: ${track.id}`, x1 + 4, y1 - 6);
    });
  };
  img.src = `data:image/jpeg;base64,${base64Frame}`;
}

let alertTimeout = null;

function handleAlerts(alerts) {
  if (alerts && alerts.length > 0) {
    playAlertSound();

    alerts.forEach(alert => {

      alertMessage.textContent = alert.message;
      alertBanner.classList.remove('hidden');

      const logEl = document.createElement('div');
      logEl.className = 'log-entry critical';
      const timeStr = new Date(alert.timestamp * 1000).toLocaleTimeString();
      logEl.innerHTML = `
        <div class="log-time">${timeStr}</div>
        <div>${alert.message}</div>
      `;
      logsContainer.prepend(logEl);
    });

    if (alertTimeout) clearTimeout(alertTimeout);
    alertTimeout = setTimeout(() => {
      alertBanner.classList.add('hidden');
    }, 3000);
  }
}

function updateTrackingTable(tracking, alerts) {
  const alertIds = alerts ? alerts.map(a => a.track_id) : [];

  trackingBody.innerHTML = '';
  tracking.forEach(t => {
    const isAlert = alertIds.includes(t.id);
    const statusText = isAlert ? 'Stalled / Anomaly' : 'Moving Normally';
    const statusClass = isAlert ? 'warning' : 'active';

    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${t.id}</td>
      <td>
        <div class="status-indicator">
          <span class="status-dot ${statusClass}"></span>
          ${statusText}
        </div>
      </td>
      <td>Just now</td>
    `;
    trackingBody.appendChild(row);
  });
}

function updateDensity(density) {
  const countLeftEl = document.getElementById('countLeft');
  const countRightEl = document.getElementById('countRight');
  const intLeftEl = document.getElementById('intensityLeft');
  const intRightEl = document.getElementById('intensityRight');

  if (!countLeftEl) return;

  countLeftEl.textContent = density.counts.left;
  countRightEl.textContent = density.counts.right;

  intLeftEl.textContent = density.intensity.left;
  intLeftEl.className = 'stat-badge ' + (density.intensity.left === 'Heavy' ? 'heavy' : '');

  intRightEl.textContent = density.intensity.right;
  intRightEl.className = 'stat-badge ' + (density.intensity.right === 'Heavy' ? 'heavy' : '');
}

connectWebSocket();

document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  } else if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}, { once: true });

let isConfigMode = false;
let leftLanePoints = [];
let rightLanePoints = [];
let activePolygon = 'left';

const btnEditLanes = document.getElementById('btnEditLanes');
const drawingTools = document.getElementById('drawingTools');
const btnResetDrawing = document.getElementById('btnResetDrawing');
const btnSaveDrawing = document.getElementById('btnSaveDrawing');
const drawingInstructions = document.getElementById('drawingInstructions');

function drawPolygon(points, color) {
  if (!points || points.length === 0) return;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i][0], points[i][1]);
  }
  if (points.length === 4) ctx.closePath();
  ctx.stroke();

  points.forEach(p => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function updateDrawingUI() {
  if (activePolygon === 'left') {
    drawingInstructions.innerHTML = `Click ${4 - leftLanePoints.length} more points to map the <strong>Left Lane</strong>.`;
  } else if (activePolygon === 'right') {
    drawingInstructions.innerHTML = `Click ${4 - rightLanePoints.length} more points to map the <strong>Right Lane</strong>.`;
  } else {
    drawingInstructions.innerHTML = `<strong>Configuration Complete!</strong>`;
  }

  if (activePolygon === 'done') {
    btnSaveDrawing.classList.remove('hidden');
  } else {
    btnSaveDrawing.classList.add('hidden');
  }
}

if (btnEditLanes) {
  btnEditLanes.addEventListener('click', () => {
    isConfigMode = !isConfigMode;
    if (isConfigMode) {
      drawingTools.classList.remove('hidden');
      btnEditLanes.textContent = '❌ Cancel Config';
      leftLanePoints = [];
      rightLanePoints = [];
      activePolygon = 'left';
      updateDrawingUI();
    } else {
      drawingTools.classList.add('hidden');
      btnEditLanes.textContent = '⚙️ Config Lanes';
    }
  });
}

if (btnResetDrawing) {
  btnResetDrawing.addEventListener('click', () => {
    leftLanePoints = [];
    rightLanePoints = [];
    activePolygon = 'left';
    updateDrawingUI();
  });
}

if (btnSaveDrawing) {
  btnSaveDrawing.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'CONFIG_ZONES',
        left_polygon: leftLanePoints,
        right_polygon: rightLanePoints
      }));
    }
    isConfigMode = false;
    drawingTools.classList.add('hidden');
    btnEditLanes.textContent = '⚙️ Config Lanes';
  });
}

canvas.addEventListener('mousedown', (e) => {
  if (!isConfigMode || activePolygon === 'done') return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  const x = Math.round((e.clientX - rect.left) * scaleX);
  const y = Math.round((e.clientY - rect.top) * scaleY);

  if (activePolygon === 'left') {
    leftLanePoints.push([x, y]);
    if (leftLanePoints.length === 4) activePolygon = 'right';
  } else if (activePolygon === 'right') {
    rightLanePoints.push([x, y]);
    if (rightLanePoints.length === 4) activePolygon = 'done';
  }

  updateDrawingUI();
});
