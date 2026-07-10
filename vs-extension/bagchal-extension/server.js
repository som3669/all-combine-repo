'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const os = require('os');

const PORT = process.env.PORT || 3000;

// ─── Game Logic ───────────────────────────────────────────────────────────────
const EMPTY = 0, GOAT = 1, TIGER = 2;

function makeState() {
    const board = Array(25).fill(EMPTY);
    board[0] = board[4] = board[20] = board[24] = TIGER;
    return { board, phase: 'placement', turn: 'goat', goatsLeft: 20, captured: 0, over: false, winner: null };
}

function nbrs(pos) {
    const r = Math.floor(pos / 5), c = pos % 5;
    const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    if ((r + c) % 2 === 0) dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
    return dirs.map(([dr,dc]) => [r+dr, c+dc])
        .filter(([nr,nc]) => nr >= 0 && nr < 5 && nc >= 0 && nc < 5)
        .map(([nr,nc]) => nr * 5 + nc);
}

function tigerCaps(state, from) {
    const caps = [];
    for (const gp of nbrs(from)) {
        if (state.board[gp] !== GOAT) continue;
        const to = 2 * gp - from;
        if (to < 0 || to >= 25) continue;
        if (!nbrs(gp).includes(to)) continue;
        if (state.board[to] !== EMPTY) continue;
        caps.push({ from, to, cap: gp });
    }
    return caps;
}

function tigerMoves(state, from) {
    const regular = nbrs(from).filter(t => state.board[t] === EMPTY).map(to => ({ from, to, cap: -1 }));
    return [...tigerCaps(state, from), ...regular];
}

function allTigerMoves(state) {
    const m = [];
    for (let i = 0; i < 25; i++) if (state.board[i] === TIGER) m.push(...tigerMoves(state, i));
    return m;
}

function checkWin(state) {
    if (state.captured >= 5) { state.over = true; state.winner = 'tiger'; return; }
    if (allTigerMoves(state).length === 0) { state.over = true; state.winner = 'goat'; }
}

function applyMove(state, msg) {
    const { board } = state;

    if (msg.type === 'place') {
        if (state.phase !== 'placement' || state.turn !== 'goat') return false;
        if (board[msg.pos] !== EMPTY) return false;
        board[msg.pos] = GOAT;
        state.goatsLeft--;
        if (state.goatsLeft === 0) state.phase = 'movement';
        checkWin(state);
        if (!state.over) state.turn = 'tiger';
        return true;
    }

    if (msg.type === 'move') {
        const { from, to } = msg;
        if (state.turn === 'goat') {
            if (board[from] !== GOAT) return false;
            if (!nbrs(from).includes(to) || board[to] !== EMPTY) return false;
            board[from] = EMPTY; board[to] = GOAT;
            checkWin(state);
            if (!state.over) state.turn = 'tiger';
            return true;
        }
        if (state.turn === 'tiger') {
            if (board[from] !== TIGER) return false;
            const legal = tigerMoves(state, from);
            const mv = legal.find(m => m.to === to);
            if (!mv) return false;
            board[mv.from] = EMPTY; board[mv.to] = TIGER;
            if (mv.cap >= 0) { board[mv.cap] = EMPTY; state.captured++; }
            checkWin(state);
            if (!state.over) state.turn = 'goat';
            return true;
        }
    }
    return false;
}

// ─── Server ───────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
    const file = path.join(__dirname, 'client.html');
    fs.readFile(file, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    });
});

const wss = new WebSocketServer({ server });

// Room: max 2 players
let room = { goat: null, tiger: null, state: makeState() };

function broadcast(data) {
    const msg = JSON.stringify(data);
    [room.goat, room.tiger].forEach(ws => { if (ws && ws.readyState === 1) ws.send(msg); });
}

function sendState() {
    broadcast({ type: 'state', state: room.state, roles: { goat: !!room.goat, tiger: !!room.tiger } });
}

wss.on('connection', ws => {
    let role = null;

    ws.on('message', raw => {
        let msg;
        try { msg = JSON.parse(raw); } catch { return; }

        if (msg.type === 'join') {
            const want = msg.role;
            if (want === 'goat' && !room.goat) { room.goat = ws; role = 'goat'; }
            else if (want === 'tiger' && !room.tiger) { room.tiger = ws; role = 'tiger'; }
            else { ws.send(JSON.stringify({ type: 'error', msg: 'Spot taken' })); return; }
            ws.send(JSON.stringify({ type: 'joined', role }));
            sendState();
            return;
        }

        if (msg.type === 'reset') {
            room.state = makeState();
            sendState();
            return;
        }

        if (!role) { ws.send(JSON.stringify({ type: 'error', msg: 'Pick a role first' })); return; }
        if (role !== room.state.turn) { ws.send(JSON.stringify({ type: 'error', msg: 'Not your turn' })); return; }
        if (room.state.over) return;

        const ok = applyMove(room.state, msg);
        if (ok) sendState();
        else ws.send(JSON.stringify({ type: 'error', msg: 'Illegal move' }));
    });

    ws.on('close', () => {
        if (role === 'goat') room.goat = null;
        if (role === 'tiger') room.tiger = null;
        broadcast({ type: 'player_left', role });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    const ip = Object.values(os.networkInterfaces())
        .flat().find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
    console.log('');
    console.log('  Bagchal server running!');
    console.log('');
    console.log('  Local:   http://localhost:' + PORT);
    console.log('  Network: http://' + ip + ':' + PORT);
    console.log('');
    console.log('  Share the Network URL with your friend.');
    console.log('  Each player picks a role (Tiger / Goat) in browser.');
    console.log('');
});
