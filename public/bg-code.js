(function () {
  const canvas = document.createElement('canvas');
  canvas.id = 'bgCode';
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', zIndex: '-1', top: '0', left: '0'
  });
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');

  const chars = 'const let function() => { } [ ] ; if while return class import 01{}<>#$%';
  const symbols = chars.split(' ').join('').split('');
  let cols, drops;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    cols = Math.floor(canvas.width / 16);
    drops = new Array(cols).fill(0).map(() => Math.random() * -50);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw() {
    ctx.fillStyle = 'rgba(10, 14, 22, 0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3ddc84';
    ctx.font = '14px monospace';
    for (let i = 0; i < cols; i++) {
      const text = symbols[Math.floor(Math.random() * symbols.length)];
      ctx.fillText(text, i * 16, drops[i] * 16);
      if (drops[i] * 16 > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
    requestAnimationFrame(draw);
  }
  draw();
})();
