const button = document.querySelector('button');
button.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  button.setPointerCapture(event.pointerId);
  window.ball.start();
});
button.addEventListener('pointerup', () => window.ball.end(false));
button.addEventListener('pointercancel', () => window.ball.end(true));
button.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.ball.start(); window.ball.end(false); }
});

const avatar = document.querySelector('img');
const updateAvatar = (value) => { avatar.src = value || '../assets/app-icon.png'; };
window.ball.onAvatar(updateAvatar);
window.ball.avatar().then(updateAvatar);
