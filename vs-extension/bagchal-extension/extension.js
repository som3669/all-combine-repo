'use strict';
const vscode = require('vscode');

function activate(context) {
    const cmd = vscode.commands.registerCommand('bagchal.play', () => {
        const panel = vscode.window.createWebviewPanel(
            'bagchalGame', 'Bagchal 🐅',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );
        panel.webview.html = getHtml();
    });
    context.subscriptions.push(cmd);
}

function deactivate() {}
module.exports = { activate, deactivate };

function getHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
<title>Bagchal</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#181825;color:#cdd6f4;font-family:'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;min-height:100vh;padding:20px 16px;gap:12px;}
h1{font-size:28px;letter-spacing:3px;margin-bottom:2px}
.sub{color:#585b70;font-size:13px}
.screen{display:none;flex-direction:column;align-items:center;gap:16px;width:100%}
.screen.active{display:flex}
.card{background:#1e1e2e;border:1px solid #313244;border-radius:12px;padding:32px 40px;display:flex;flex-direction:column;align-items:center;gap:18px;max-width:380px;width:100%}
.card h2{font-size:18px}
.card p{color:#a6adc8;font-size:13px;text-align:center;line-height:1.6}
.row{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.mbtn{padding:14px 32px;border-radius:8px;border:2px solid;cursor:pointer;font-size:15px;font-weight:600;background:transparent;transition:all .2s;min-width:130px}
.mbtn.goat{color:#a6e3a1;border-color:#a6e3a1}
.mbtn.goat:hover{background:#a6e3a1;color:#11111b}
.mbtn.tiger{color:#f38ba8;border-color:#f38ba8}
.mbtn.tiger:hover{background:#f38ba8;color:#11111b}
.mbtn.neutral{color:#cdd6f4;border-color:#45475a}
.mbtn.neutral:hover{background:#45475a}
#status{font-size:15px;padding:8px 24px;border-radius:20px;background:#1e1e2e;border:1px solid #313244;min-width:300px;text-align:center;transition:all .3s}
#board{cursor:pointer;filter:drop-shadow(0 6px 18px rgba(0,0,0,.6))}
.info{display:flex;gap:28px;font-size:14px;color:#a6adc8}
.info span{color:#cdd6f4;font-weight:600}
.btns{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
button.act{padding:8px 18px;background:#313244;color:#cdd6f4;border:1px solid #45475a;border-radius:6px;cursor:pointer;font-size:13px}
button.act:hover{background:#45475a}
.legend{display:flex;gap:18px;font-size:12px;color:#6c7086}
.li{display:flex;align-items:center;gap:5px}
.dot{width:12px;height:12px;border-radius:50%;display:inline-block}
.rules{max-width:400px;font-size:12px;color:#585b70;text-align:center;line-height:1.7}
#badge{font-size:13px;padding:4px 14px;border-radius:12px;border:1px solid #313244;background:#1e1e2e;color:#a6adc8}
</style>
</head>
<body>
<h1>बाघचाल</h1>
<div class="sub">Traditional Nepali Tiger &amp; Goat Game</div>

<div id="sMode" class="screen active">
  <div class="card">
    <h2>Choose Mode</h2>
    <div class="row">
      <button class="mbtn neutral" onclick="chooseMode('ai')">🤖 vs AI</button>
      <button class="mbtn neutral" onclick="chooseMode('2p')">👥 2 Players</button>
    </div>
    <p>2 Players: take turns on same screen, no internet needed</p>
  </div>
</div>

<div id="sRole" class="screen">
  <div class="card">
    <h2>Choose Your Side</h2>
    <p>AI will play the other side</p>
    <div class="row">
      <button class="mbtn goat" onclick="chooseRole('goat')">🐐 Play as Goat</button>
      <button class="mbtn tiger" onclick="chooseRole('tiger')">🐅 Play as Tiger</button>
    </div>
  </div>
</div>

<div id="sGame" class="screen">
  <div id="badge"></div>
  <div id="status">Loading…</div>
  <svg id="board" width="460" height="460" viewBox="0 0 460 460"></svg>
  <div class="info">
    <div>Goats to place: <span id="toPlace">20</span></div>
    <div>Goats captured: <span id="captured">0</span></div>
  </div>
  <div class="btns">
    <button class="act" onclick="newGame()">New Game</button>
    <button class="act" onclick="backToMenu()">Change Mode</button>
  </div>
  <div class="legend">
    <div class="li"><div class="dot" style="background:#f38ba8"></div>Tiger</div>
    <div class="li"><div class="dot" style="background:#a6e3a1"></div>Goat</div>
    <div class="li"><div class="dot" style="background:#89b4fa;opacity:.5"></div>Valid move</div>
  </div>
  <div class="rules">Tigers win capturing 5 goats &bull; Goats win blocking all tigers</div>
</div>

<script>
var EMPTY=0,GOAT=1,TIGER=2,PAD=55,STP=87;
var gameMode=null,humanRole=null,aiRole=null;
var board,phase,turn,goatsLeft,captured,sel,over,winner;

function show(id){
  ['sMode','sRole','sGame'].forEach(function(s){
    var e=document.getElementById(s);
    e.style.display=s===id?'flex':'none';
    if(s===id)e.classList.add('active');else e.classList.remove('active');
  });
}

function chooseMode(m){
  gameMode=m;
  if(m==='ai'){show('sRole');}
  else{humanRole=null;aiRole=null;show('sGame');newGame();}
}

function chooseRole(role){
  humanRole=role;
  aiRole=role==='goat'?'tiger':'goat';
  show('sGame');
  newGame();
}

function backToMenu(){show('sMode');}

// ─── Geometry ───
function xy(i){return{x:PAD+(i%5)*STP,y:PAD+Math.floor(i/5)*STP};}
function nbrs(pos){
  var r=Math.floor(pos/5),c=pos%5,out=[];
  var dirs=[[-1,0],[1,0],[0,-1],[0,1]];
  if((r+c)%2===0)dirs.push([-1,-1],[-1,1],[1,-1],[1,1]);
  for(var d=0;d<dirs.length;d++){var nr=r+dirs[d][0],nc=c+dirs[d][1];if(nr>=0&&nr<5&&nc>=0&&nc<5)out.push(nr*5+nc);}
  return out;
}

// ─── Move generators ───
function tigerCaps(from){
  var caps=[];
  nbrs(from).forEach(function(gp){
    if(board[gp]!==GOAT)return;
    var to=2*gp-from;
    if(to<0||to>=25||nbrs(gp).indexOf(to)<0||board[to]!==EMPTY)return;
    caps.push({from:from,to:to,cap:gp});
  });
  return caps;
}
function tigerMoves(from){
  return tigerCaps(from).concat(
    nbrs(from).filter(function(t){return board[t]===EMPTY;}).map(function(to){return{from:from,to:to,cap:-1};})
  );
}
function allTigerMoves(){
  var m=[];for(var i=0;i<25;i++)if(board[i]===TIGER)m=m.concat(tigerMoves(i));return m;
}
function goatMoves(from){
  return nbrs(from).filter(function(t){return board[t]===EMPTY;}).map(function(to){return{from:from,to:to};});
}
function allGoatMoves(){
  var m=[];for(var i=0;i<25;i++)if(board[i]===GOAT)m=m.concat(goatMoves(i));return m;
}

function checkWin(){
  if(captured>=5){over=true;winner='tiger';}
  else if(allTigerMoves().length===0){over=true;winner='goat';}
}

// ─── Tiger AI ───
function scoreTigerMove(m){
  var s=m.cap>=0?100:0;
  board[m.from]=EMPTY;board[m.to]=TIGER;
  s+=tigerCaps(m.from).length*15;
  s+=nbrs(m.to).filter(function(n){return board[n]===GOAT;}).length*3;
  s-=(Math.abs(Math.floor(m.to/5)-2)+Math.abs(m.to%5-2))*0.5;
  board[m.from]=TIGER;board[m.to]=EMPTY;
  return s;
}
function aiTigerMove(){
  var moves=allTigerMoves();if(!moves.length)return;
  moves.sort(function(a,b){return scoreTigerMove(b)-scoreTigerMove(a);});
  var best=scoreTigerMove(moves[0]);
  var top=moves.filter(function(m){return scoreTigerMove(m)>=best-3;});
  var m=top[Math.floor(Math.random()*top.length)];
  board[m.from]=EMPTY;board[m.to]=TIGER;
  if(m.cap>=0){board[m.cap]=EMPTY;captured++;}
  turn='goat';checkWin();render();updateStatus();
}

// ─── Goat AI ───
function isCapturableAt(pos){
  for(var t=0;t<25;t++){
    if(board[t]!==TIGER)continue;
    if(tigerCaps(t).some(function(c){return c.cap===pos;}))return true;
  }
  return false;
}
function aiGoatPlace(){
  var best=-Infinity,bestPos=-1;
  for(var i=0;i<25;i++){
    if(board[i]!==EMPTY)continue;
    board[i]=GOAT;
    if(isCapturableAt(i)){board[i]=EMPTY;continue;}
    var r=Math.floor(i/5),c=i%5;
    var s=4-(Math.abs(r-2)+Math.abs(c-2));
    s+=nbrs(i).filter(function(n){return board[n]===GOAT;}).length*2;
    s-=allTigerMoves().length*0.4;
    board[i]=EMPTY;
    if(s>best){best=s;bestPos=i;}
  }
  if(bestPos<0)for(var i=0;i<25;i++){if(board[i]===EMPTY){bestPos=i;break;}}
  if(bestPos<0)return;
  board[bestPos]=GOAT;goatsLeft--;
  if(goatsLeft===0)phase='movement';
  checkWin();if(!over)turn='tiger';
  render();updateStatus();
}
function scoreGoatMove(mv){
  var s=0;
  board[mv.from]=EMPTY;board[mv.to]=GOAT;
  if(isCapturableAt(mv.to))s-=80;
  s-=allTigerMoves().length*3;
  s+=nbrs(mv.to).filter(function(n){return board[n]===GOAT;}).length*2;
  var r=Math.floor(mv.to/5),c=mv.to%5;
  s+=2-(Math.abs(r-2)+Math.abs(c-2));
  board[mv.from]=GOAT;board[mv.to]=EMPTY;
  return s;
}
function aiGoatMove(){
  var moves=allGoatMoves();if(!moves.length)return;
  moves.sort(function(a,b){return scoreGoatMove(b)-scoreGoatMove(a);});
  var best=scoreGoatMove(moves[0]);
  var top=moves.filter(function(m){return scoreGoatMove(m)>=best-5;});
  var mv=top[Math.floor(Math.random()*top.length)];
  board[mv.from]=EMPTY;board[mv.to]=GOAT;
  checkWin();if(!over)turn='tiger';
  render();updateStatus();
}

function scheduleAI(){
  if(gameMode!=='ai'||over)return;
  if(turn!==aiRole)return;
  setTimeout(function(){
    if(over||turn!==aiRole)return;
    if(aiRole==='tiger')aiTigerMove();
    else{if(phase==='placement')aiGoatPlace();else aiGoatMove();}
  },480);
}

// ─── Human interaction ───
function canAct(){
  if(gameMode==='2p')return true;
  return turn===humanRole;
}
function isMyPiece(pos){
  return(turn==='goat'&&board[pos]===GOAT)||(turn==='tiger'&&board[pos]===TIGER);
}
function dests(){
  if(!sel)return[];
  if(turn==='goat'&&board[sel]===GOAT)return goatMoves(sel).map(function(m){return m.to;});
  if(turn==='tiger'&&board[sel]===TIGER)return tigerMoves(sel).map(function(m){return m.to;});
  return[];
}

function click(pos){
  if(over||!canAct())return;
  if(phase==='placement'&&turn==='goat'){
    if(board[pos]!==EMPTY)return;
    board[pos]=GOAT;goatsLeft--;
    if(goatsLeft===0)phase='movement';
    checkWin();if(!over)turn='tiger';
    render();updateStatus();
    if(!over)scheduleAI();
    return;
  }
  if(sel===null){
    if(isMyPiece(pos)){sel=pos;render();}
  } else {
    if(pos===sel){sel=null;render();return;}
    var mv=null;
    if(turn==='goat'){
      var gm=goatMoves(sel);
      for(var i=0;i<gm.length;i++)if(gm[i].to===pos){mv=gm[i];break;}
      if(mv){
        board[mv.from]=EMPTY;board[mv.to]=GOAT;sel=null;
        checkWin();if(!over)turn='tiger';
        render();updateStatus();if(!over)scheduleAI();
      } else if(board[pos]===GOAT&&canAct()){sel=pos;render();}
      else{sel=null;render();}
    } else {
      var tm=tigerMoves(sel);
      for(var j=0;j<tm.length;j++)if(tm[j].to===pos){mv=tm[j];break;}
      if(mv){
        board[mv.from]=EMPTY;board[mv.to]=TIGER;
        if(mv.cap>=0){board[mv.cap]=EMPTY;captured++;}
        sel=null;checkWin();if(!over)turn='goat';
        render();updateStatus();if(!over)scheduleAI();
      } else if(board[pos]===TIGER&&canAct()){sel=pos;render();}
      else{sel=null;render();}
    }
  }
}

// ─── Render ───
function render(){
  var svg=document.getElementById('board');svg.innerHTML='';
  var ns='http://www.w3.org/2000/svg';
  function el(tag,a){var e=document.createElementNS(ns,tag);for(var k in a)e.setAttribute(k,a[k]);return e;}
  svg.appendChild(el('rect',{width:460,height:460,fill:'#1e1e2e',rx:14}));
  for(var i=0;i<25;i++){
    var nb=nbrs(i);
    for(var k=0;k<nb.length;k++){
      var j=nb[k];
      if(j>i){var p1=xy(i),p2=xy(j);svg.appendChild(el('line',{x1:p1.x,y1:p1.y,x2:p2.x,y2:p2.y,stroke:'#45475a','stroke-width':2,'stroke-linecap':'round'}));}
    }
  }
  var ds=dests();
  for(var i=0;i<25;i++){(function(pos){
    var p=xy(pos),g=document.createElementNS(ns,'g');
    g.setAttribute('transform','translate('+p.x+','+p.y+')');
    g.style.cursor='pointer';
    g.addEventListener('click',function(){click(pos);});
    if(ds.indexOf(pos)>=0)g.appendChild(el('circle',{r:28,fill:'#89b4fa',opacity:0.22}));
    if(board[pos]!==EMPTY)g.appendChild(el('circle',{r:22,fill:'#11111b',opacity:0.4,cy:3}));
    var radius=board[pos]!==EMPTY?20:10;if(pos===sel)radius=22;
    var fill=pos===sel?'#fab387':board[pos]===TIGER?'#f38ba8':board[pos]===GOAT?'#a6e3a1':'#313244';
    var circ=el('circle',{r:radius,fill:fill});
    if(board[pos]===EMPTY){circ.setAttribute('stroke','#585b70');circ.setAttribute('stroke-width','2');}
    g.appendChild(circ);
    if(board[pos]!==EMPTY){
      var txt=document.createElementNS(ns,'text');
      txt.setAttribute('text-anchor','middle');txt.setAttribute('dominant-baseline','central');
      txt.setAttribute('font-size','22');txt.setAttribute('pointer-events','none');
      txt.textContent=board[pos]===TIGER?'🐅':'🐐';
      g.appendChild(txt);
    }
    g.appendChild(el('circle',{r:32,fill:'transparent'}));
    svg.appendChild(g);
  })(i);}
  document.getElementById('toPlace').textContent=goatsLeft;
  document.getElementById('captured').textContent=captured;
}

// ─── Status ───
function updateStatus(){
  var sb=document.getElementById('status');
  var bd=document.getElementById('badge');
  if(gameMode==='ai'){
    bd.textContent='You: '+(humanRole==='tiger'?'🐅 Tiger':'🐐 Goat')+' | AI: '+(aiRole==='tiger'?'🐅 Tiger':'🐐 Goat');
  } else {
    bd.textContent='Turn: '+(turn==='tiger'?'🐅 Tiger':'🐐 Goat');
  }
  if(over){
    if(winner==='tiger'){sb.style.cssText='background:#3d1f2a;border-color:#f38ba8;color:#f38ba8';sb.textContent='🐅 Tigers win! 5 goats captured';}
    else{sb.style.cssText='background:#1f3d2a;border-color:#a6e3a1;color:#a6e3a1';sb.textContent='🐐 Goats win! Tigers are blocked';}
    return;
  }
  sb.style.cssText='background:#1e1e2e;border-color:#313244;color:#cdd6f4';
  if(gameMode==='ai'&&turn===aiRole){
    sb.textContent=turn==='tiger'?'🐅 Tiger thinking…':'🐐 Goat thinking…';
    return;
  }
  if(phase==='placement'){
    sb.textContent='🐐 Place a goat ('+goatsLeft+' left)';
  } else if(turn==='goat'){
    sb.textContent=sel!==null?'🐐 Click destination':'🐐 Select a goat to move';
  } else {
    sb.textContent=sel!==null?'🐅 Click destination':'🐅 Select a tiger to move';
  }
}

// ─── New game ───
function newGame(){
  board=Array(25).fill(EMPTY);
  board[0]=board[4]=board[20]=board[24]=TIGER;
  phase='placement';turn='goat';goatsLeft=20;captured=0;sel=null;over=false;winner=null;
  render();updateStatus();
  scheduleAI();
}

show('sMode');
</script>
</body>
</html>`;
}
