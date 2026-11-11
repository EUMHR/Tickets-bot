const form = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const revealButton = document.getElementById('togglePassword');
const submitButton = document.getElementById('submitButton');
const status = document.getElementById('loginStatus');

revealButton.addEventListener('click', () => {
  const revealing = passwordInput.type === 'password';
  passwordInput.type = revealing ? 'text' : 'password';
  revealButton.textContent = revealing ? 'Hide' : 'Show';
  revealButton.setAttribute('aria-label', `${revealing ? 'Hide' : 'Show'} password`);
  revealButton.setAttribute('aria-pressed', String(revealing));
  passwordInput.focus();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  status.textContent = '';
  status.classList.remove('is-error');
  submitButton.disabled = true;
  submitButton.querySelector('span:first-child').textContent = 'Checking access...';

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameInput.value, password: passwordInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
    window.location.assign('/admin');
  } catch (error) {
    status.textContent = error.message || 'Could not reach the dashboard.';
    status.classList.add('is-error');
    passwordInput.select();
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector('span:first-child').textContent = 'Unlock workspace';
  }
});
