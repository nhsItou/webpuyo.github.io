(() => {
  //定数
  const CELL = 40;

  //色指定
  const COLORS = ['red','yellow','green','blue','magenta'];
  const COLOR_FALLBACK = {
    red: '#e74c3c',
    yellow: '#ffb300',
    green: '#2ecc71',
    blue: '#3498db',
    magenta: '#9b59b6'
  };

  const ctx = document.getElementById('board').getContext('2d');
  const nextCtx = document.getElementById('next').getContext('2d');
  const scoreEl = document.getElementById('score');
  const chainEl = document.getElementById('chain');
  const restartBtn = document.getElementById('restart');

  //画像読み込み
  const puyoImg = {};
  for(const name of COLORS){
    const img = new Image();
    img.src = `assets/${name}.png`;
    puyoImg[name] = img;
  }

  //変数宣言
  let grid,                 //盤面情報
      cur,                  //現在操作中のペア
      nextPair,             //次のペア
      dropInterval = 700,   //自動落下間隔（ミリ秒）
      lastDrop = 0;         //最後に自動落下した時刻
  let score = 0,            //スコア
      chainCount = 0,       //連鎖数
      running = true;       //ゲーム進行中フラグ
  let clearingCells = [];   //消去中のセル情報

  const config = {
  cols: 6,
  rows: 12
};

function makeGrid(cols, rows){ //盤面初期化
  const g = [];
  for(let r = 0; r < rows + 2; r++){
    g.push(new Array(cols).fill(null));//null埋め
  }
  return g;
}

  function randColor(){ return COLORS[Math.floor(Math.random()*COLORS.length)]; } //ランダムに色を生成
  function newPair(){ return [{x:2,y:0,color:randColor()},{x:2,y:1,color:randColor()}]; } //新しいペアを生成

  function spawn(){ //新しいペアを出現させる
    cur = nextPair || newPair();  //ネクストがあるなら、それを操作用にし、なければ新規生成
    nextPair = newPair();          //ネクストを新規生成
    const ox = Math.floor(config.cols / 2);
    cur[0].x = ox; cur[0].y = 0;
    cur[1].x = ox; cur[1].y = 1;
    if(collision(cur)){   //新しいペア画衝突していたらゲームオーバー
      running = false;
      alert('ゲームオーバー\nスコア: ' + score);
    }
  }

  function placePairToGrid(){   //現在のペアを盤面に固定する
    for(const p of cur){ if(p.y>=0) grid[p.y][p.x] = p.color; }
    cur = null;
  }

  function collision(pair){ //衝突判定
    for(const p of pair){
      if(p.x<0 || p.x>=config.cols || p.y>=config.rows+2) return true;
      if(p.y>=0 && grid[p.y][p.x]) return true;
    }
    return false;
  }

  function rotateCW(){  //時計回り回転
    if(!cur) return;
    const px = cur[0].x, py = cur[0].y;
    const cx = cur[1].x, cy = cur[1].y;
    const dx = cx - px, dy = cy - py;
    const nx = px - dy, ny = py + dx;
    const old = {...cur[1]};
    cur[1].x = nx; cur[1].y = ny;
    if(collision(cur)){
      const tries = [[1,0],[-1,0],[0,-1],[2,0],[-2,0]];
      let ok=false;
      for(const t of tries){
        cur[0].x += t[0]; cur[0].y += t[1];
        cur[1].x += t[0]; cur[1].y += t[1];
        if(!collision(cur)){ ok=true; break; }
        cur[0].x -= t[0]; cur[0].y -= t[1];
        cur[1].x -= t[0]; cur[1].y -= t[1];
      }
      if(!ok){ cur[1] = old; }
    }
  }

  function rotateCCW(){ //反時計回り回転
  if(!cur) return;

  const px = cur[0].x, py = cur[0].y;
  const cx = cur[1].x, cy = cur[1].y;

  const dx = cx - px;
  const dy = cy - py;

  const nx = px + dy;
  const ny = py - dx;

  const old = {...cur[1]};
  cur[1].x = nx;
  cur[1].y = ny;

  if(collision(cur)){
    const tries = [[1,0],[-1,0],[0,-1],[2,0],[-2,0]];
    let ok = false;
    for(const t of tries){
      cur[0].x += t[0]; cur[0].y += t[1];
      cur[1].x += t[0]; cur[1].y += t[1];
      if(!collision(cur)){ ok = true; break; }
      cur[0].x -= t[0]; cur[0].y -= t[1];
      cur[1].x -= t[0]; cur[1].y -= t[1];
    }
    if(!ok){
      cur[1] = old;
    }
  }
}


  function move(dx){  //左右移動
    if(!cur) return;
    for(const p of cur) p.x += dx;
    if(collision(cur)) for(const p of cur) p.x -= dx;
  }

  function softDrop(flg){  //ソフトドロップ
    if(!cur) return;
    if(flg){
      dropInterval = 50;
      return;
    }
    else { dropInterval = 700;  }
  }

  function hardDrop(){  //ハードドロップ
    if(!cur) return;
    while(true){ for(const p of cur) p.y += 1; if(collision(cur)){ for(const p of cur) p.y -= 1; break; } }
    placePairToGrid();
    applyGravity();
    processClearsSequentially().then(()=> spawn());
  }

  function processClearsSequentially(){ //連鎖処理
    return new Promise((resolve) => {
      let localChain = 0;

      function step(){
        const groups = findGroups();
        const toClear = groups.filter(g => g.length >= 4);
        if(toClear.length === 0){
          chainCount = localChain;
          chainEl.textContent = chainCount;
          resolve();
          return;
        }

        const setKey = (x,y) => `${x},${y}`;
        const willClearSet = new Set();
        for(const g of toClear){ for(const c of g){ willClearSet.add(setKey(c.x,c.y)); } }
        const willClear = Array.from(willClearSet).map(s => { const [x,y] = s.split(',').map(Number); return {x,y}; });

        clearingCells = willClear.slice();

        const flashDuration = 300;
        const flashStart = performance.now();

        function flashFrame(now){
          const elapsed = now - flashStart;
          draw();
          if(elapsed < flashDuration){
            requestAnimationFrame(flashFrame);
          } else {
            let clearedThis = 0;
            for(const cell of willClear){
              if(grid[cell.y][cell.x]){
                grid[cell.y][cell.x] = null;
                clearedThis++;
              }
            }
            localChain++;
            score += clearedThis * 10 * localChain;
            scoreEl.textContent = score;

            clearingCells = [];
            applyGravity();
            draw();

            setTimeout(() => {
              step();
            }, 200);
          }
        }
        requestAnimationFrame(flashFrame);
      }
      step();
    });
  }

  function findGroups(){  //連結グループ検出
    const seen = Array.from({length:config.rows+2},()=>new Array(config.cols).fill(false));
    const groups = [];
    for(let y=0;y<config.rows+2;y++){
      for(let x=0;x<config.cols;x++){
        if(grid[y][x] && !seen[y][x]){
          const color = grid[y][x];
          const stack = [{x,y}];
          const g = [];
          seen[y][x]=true;
          while(stack.length){
            const p = stack.pop();
            g.push(p);
            const deltas = [[1,0],[-1,0],[0,1],[0,-1]];
            for(const d of deltas){
              const nx=p.x+d[0], ny=p.y+d[1];
              if(nx>=0 && nx<config.cols && ny>=0 && ny<config.rows+2 && !seen[ny][nx] && grid[ny][nx]===color){
                seen[ny][nx]=true; stack.push({x:nx,y:ny});
              }
            }
          }
          groups.push(g);
        }
      }
    }
    return groups;
  }

  function applyGravity(){  //重力適用
    for(let x=0;x<config.cols;x++){
      let write = config.rows+1;
      for(let y=config.rows+1;y>=0;y--){
        if(grid[y][x]){ grid[write][x] = grid[y][x]; if(write!==y) grid[y][x]=null; write--; }
      }
      for(let y=write;y>=0;y--) grid[y][x]=null;
    }
  }

  function draw(){  //描画
    ctx.clearRect(0,0,ctx.canvas.width,ctx.canvas.height);
    for(let r=2;r<config.rows+2;r++){ 
      for(let c=0;c<config.cols;c++){
        ctx.fillStyle = '#071026';
        ctx.fillRect(c*CELL, (r-2)*CELL, CELL, CELL);
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.strokeRect(c*CELL, (r-2)*CELL, CELL, CELL);
      }
    }
    for(let y=2;y<config.rows+2;y++){
      for(let x=0;x<config.cols;x++){
        const col = grid[y][x];
        if(col){ drawPuyo(x, y-2, col); }
      }
    }
    if(cur){
      for(const p of cur){ if(p.y>=2){ drawPuyo(p.x, p.y-2, p.color, true); } }
    }

    if(clearingCells && clearingCells.length > 0){
      ctx.save();
      for(const cell of clearingCells){
        const gx = cell.x * CELL;
        const gy = (cell.y - 2) * CELL;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.arc(gx + CELL/2, gy + CELL/2, CELL*0.45, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }
    drawNext();
  }

  function drawPuyo(gridX, gridY, color, isGhost=false){  //ぷよ描画
    const img = puyoImg[color];
    const x = gridX * CELL;
    const y = gridY * CELL;
    if(img && img.complete && img.naturalWidth > 0){
      ctx.drawImage(img, x, y, CELL, CELL);
    } else {
      const cx = gridX*CELL + CELL/2;
      const cy = gridY*CELL + CELL/2;
      ctx.beginPath(); ctx.arc(cx, cy, CELL*0.4, 0, Math.PI*2);
      ctx.fillStyle = COLOR_FALLBACK[color] || '#ddd'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx - CELL*0.12, cy - CELL*0.16, CELL*0.15, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
    }
  }

  function drawNext(){  //次のペア描画
    nextCtx.clearRect(0,0,nextCtx.canvas.width,nextCtx.canvas.height);
    const p = nextPair || newPair();
    const canvasW = nextCtx.canvas.width;
    const canvasH = nextCtx.canvas.height;
    const size = 28;
    const centerX = canvasW/2 - size/2;
    const topY = canvasH/2 - size - 4;
    const bottomY = canvasH/2 + 4;

    const img1 = puyoImg[p[0].color];
    if(img1 && img1.complete && img1.naturalWidth > 0){
      nextCtx.drawImage(img1, centerX, topY, size, size);
    } else {
      nextCtx.beginPath();
      nextCtx.arc(centerX + size/2, topY + size/2, size/2, 0, Math.PI*2);
      nextCtx.fillStyle = COLOR_FALLBACK[p[0].color] || '#ddd';
      nextCtx.fill();
    }

    const img2 = puyoImg[p[1].color];
    if(img2 && img2.complete && img2.naturalWidth > 0){
      nextCtx.drawImage(img2, centerX, bottomY, size, size);
    } else {
      nextCtx.beginPath();
      nextCtx.arc(centerX + size/2, bottomY + size/2, size/2, 0, Math.PI*2);
      nextCtx.fillStyle = COLOR_FALLBACK[p[1].color] || '#ddd';
      nextCtx.fill();
    }
  }

  function loop(ts){  //メインループ
    if(!lastDrop) lastDrop = ts;
    if(!running) return;
    if(ts - lastDrop > dropInterval){
      lastDrop = ts;
      if(cur){
        for(const p of cur) p.y += 1;
        if(collision(cur)){
          for(const p of cur) p.y -= 1;
          placePairToGrid();
          applyGravity();
          processClearsSequentially().then(()=> spawn());
          softDrop(false);
        }
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('keydown', e => {
    if(!running) return;
    if(e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { move(-1); }
    else if(e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { move(1); }
    else if(e.key === 'e' || e.key === 'E' || e.key === 'o' || e.key === 'O') { rotateCCW(); }
    else if(e.key === 'q' || e.key === 'Q' || e.key === 'u' || e.key === 'U') { rotateCW(); }
    else if(e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { softDrop(true); }
    else if(e.key === 'ArrowUp' || e.key === 'W'||e.key === 'w'||e.code === 'Space'){ hardDrop(); }
    else if(e.key === 'r' || e.key === 'R'){ init(); }
  });

  window.addEventListener('keyup', e => {
    if(e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {softDrop(false);}
  });

  restartBtn.addEventListener('click', ()=>{ init(); });

  document.getElementById('applySize').addEventListener('click', () => {//サイズ変更適用
  const cols = Number(document.getElementById('colsInput').value);
  const rows = Number(document.getElementById('rowsInput').value);

  if((cols < 4 || cols > 20) || rows < 8 || rows > 40) return;

  config.cols = cols;
  config.rows = rows;

  init(); // サイズ変更時初期化
  });

function init(){
  grid = makeGrid(config.cols, config.rows);//盤面初期化

  //盤面サイズ設定
  const board = document.getElementById('board'); 
  board.width  = config.cols * CELL;
  board.height = config.rows * CELL;

  //変数初期化
  score = 0;
  chainCount = 0;
  running = true;
  cur = null;
  nextPair = newPair(); //初期ネクスト生成
  spawn();              //最初のペア生成

  scoreEl.textContent = score;      //スコア表示初期化
  chainEl.textContent = chainCount; //連鎖数表示初期化

  drawNext(); //ネクスト表示
  requestAnimationFrame(loop);//メインループ開始
}


  init();
})();
