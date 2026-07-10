'use strict';
const zlib = require('zlib');
const fs = require('fs');

const W = 128, H = 128;
const px = Buffer.alloc(W * H * 4);

// Fill background #1e1e2e
for (let i = 0; i < W * H * 4; i += 4) {
    px[i]=30; px[i+1]=30; px[i+2]=46; px[i+3]=255;
}

function blend(x, y, r, g, b, a) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) * 4;
    const t = a / 255;
    px[i]   = Math.round(px[i]   * (1-t) + r * t);
    px[i+1] = Math.round(px[i+1] * (1-t) + g * t);
    px[i+2] = Math.round(px[i+2] * (1-t) + b * t);
    px[i+3] = 255;
}

function circle(cx, cy, rad, r, g, b) {
    for (let y = Math.ceil(cy-rad-1); y <= cy+rad+1; y++) {
        for (let x = Math.ceil(cx-rad-1); x <= cx+rad+1; x++) {
            const d = Math.sqrt((x-cx)**2 + (y-cy)**2);
            const a = Math.max(0, Math.min(1, rad - d + 0.5));
            if (a > 0) blend(x, y, r, g, b, Math.round(a * 255));
        }
    }
}

function line(x0, y0, x1, y1, r, g, b, w) {
    const dx = x1-x0, dy = y1-y0;
    const len = Math.sqrt(dx*dx+dy*dy);
    const nx = -dy/len, ny = dx/len;
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
        const t = s/steps;
        const lx = x0 + dx*t, ly = y0 + dy*t;
        for (let off = -w; off <= w; off += 0.5) {
            const a = Math.max(0, 1 - Math.abs(off)/w * 0.7);
            blend(Math.round(lx + nx*off), Math.round(ly + ny*off), r, g, b, Math.round(a*180));
        }
    }
}

// 3x3 grid points (board)
const PAD = 18, STEP = 46;
const pts = [];
for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
        pts.push([PAD + c*STEP, PAD + r*STEP]);

// Draw board lines
const conns = [
    [0,1],[1,2],[3,4],[4,5],[6,7],[7,8],
    [0,3],[3,6],[1,4],[4,7],[2,5],[5,8],
    [0,4],[4,8],[2,4],[4,6]
];
for (const [a,b] of conns)
    line(pts[a][0],pts[a][1], pts[b][0],pts[b][1], 88,91,112, 1.2);

// Tigers (pink) at corners
for (const i of [0,2,6,8]) {
    circle(pts[i][0], pts[i][1]+2, 11, 0,0,0);         // shadow
    circle(pts[i][0], pts[i][1],   11, 243,139,168);
}

// Goats (green) at edges + center
for (const i of [1,3,4,5,7]) {
    circle(pts[i][0], pts[i][1]+2, 9, 0,0,0);           // shadow
    circle(pts[i][0], pts[i][1],   9, 166,227,161);
}

// ─── PNG encoder ───────────────────────────────────────────────────────────────
function crc32(buf) {
    const t = [];
    for (let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}
    let c=0xFFFFFFFF;
    for (const b of buf) c=t[(c^b)&0xFF]^(c>>>8);
    return (c^0xFFFFFFFF)>>>0;
}

function chunk(type, data) {
    const tb = Buffer.from(type,'ascii');
    const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb,data])));
    return Buffer.concat([lb,tb,data,cb]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4);
ihdr[8]=8; ihdr[9]=6; // RGBA

const rows = Buffer.alloc(H*(1+W*4));
for (let y=0;y<H;y++) {
    rows[y*(1+W*4)]=0;
    px.copy(rows, y*(1+W*4)+1, y*W*4, (y+1)*W*4);
}

const out = Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows,{level:9})),
    chunk('IEND', Buffer.alloc(0))
]);

fs.writeFileSync('c:/tmp/bagchal-extension/icon.png', out);
console.log('icon.png created (' + out.length + ' bytes)');
