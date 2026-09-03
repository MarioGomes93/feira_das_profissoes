const authView = document.querySelector('#auth-view');
const dashboardView = document.querySelector('#dashboard-view');
const authForm = document.querySelector('#auth-form');
const message = document.querySelector('#form-message');
const state = { mode: 'login' };

const elements = {
  eyebrow: document.querySelector('#auth-eyebrow'), title: document.querySelector('#auth-title'), subtitle: document.querySelector('#auth-subtitle'),
  tabs: document.querySelector('#auth-tabs'), nameField: document.querySelector('#name-field'), passwordField: document.querySelector('#password-field'),
  tokenField: document.querySelector('#token-field'), options: document.querySelector('#login-options'), submit: document.querySelector('#submit-button'), back: document.querySelector('#back-button'),
};

function setMessage(text, success = false) {
  message.textContent = text;
  message.className = `form-message${success ? ' success' : ''}`;
}

function setMode(mode) {
  state.mode = mode;
  const isRegister = mode === 'register';
  const isForgot = mode === 'forgot';
  const isReset = mode === 'reset';
    elements.tabs.classList.toggle('hidden', isForgot);
    elements.nameField.classList.toggle('hidden', !isRegister);
  elements.passwordField.classList.toggle('hidden', isForgot);
  elements.tokenField.classList.toggle('hidden', !isReset);
  elements.options.classList.toggle('hidden', isRegister || isForgot || isReset);
  elements.back.classList.toggle('hidden', !isForgot && !isReset);
  elements.eyebrow.textContent = isForgot || isReset ? 'Acesso seguro' : isRegister ? 'Primeiro acesso' : 'Bem-vindo de volta';
  elements.title.textContent = isForgot ? 'Solicite a recuperação' : isReset ? 'Defina uma nova senha' : isRegister ? 'Crie sua conta' : 'Acesse sua conta';
  elements.subtitle.textContent = isForgot ? 'Informe seu e-mail para receber o código.' : isReset ? 'Digite o código recebido e escolha uma nova senha.' : isRegister ? 'Faça seu cadastro para entrar na plataforma.' : 'Entre para acompanhar a operação da feira.';
  elements.submit.innerHTML = isForgot ? 'Enviar código <span>→</span>' : isReset ? 'Salvar nova senha <span>→</span>' : isRegister ? 'Criar minha conta <span>→</span>' : 'Entrar na plataforma <span>→</span>';
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === mode));
  setMessage('');
}

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));
document.querySelector('#forgot-link').addEventListener('click', () => setMode('forgot'));
elements.back.addEventListener('click', () => setMode('login'));
document.querySelector('.password-toggle').addEventListener('click', (event) => {
  const password = document.querySelector('#password');
  password.type = password.type === 'password' ? 'text' : 'password';
  event.currentTarget.textContent = password.type === 'password' ? 'Mostrar' : 'Ocultar';
});

async function request(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Não foi possível concluir a ação.');
  return data;
}

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  const form = new FormData(authForm);
  const payload = Object.fromEntries(form.entries());
  try {
    if (state.mode === 'forgot') {
      const data = await request('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) });
      if (data.devToken) {
        document.querySelector('#token').value = data.devToken;
        setMessage(`Código gerado para teste local: ${data.devToken}`, true);
        setMode('reset');
        setMessage(`Código gerado para teste local: ${data.devToken}`, true);
      } else setMessage(data.message, true);
      return;
    }
    const endpoint = state.mode === 'register' ? '/api/auth/register' : state.mode === 'reset' ? '/api/auth/reset-password' : '/api/auth/login';
    const data = await request(endpoint, { method: 'POST', body: JSON.stringify(payload) });
    if (state.mode === 'reset') { setMode('login'); setMessage('Senha atualizada. Faça login com a nova senha.', true); return; }
    showDashboard(data.user);
  } catch (error) { setMessage(error.message); }
});

async function loadDashboard() {
  const data = await request('/api/dashboard');
  document.querySelector('#department-count').textContent = data.departments.length;
  document.querySelector('#product-count').textContent = data.products.filter((item) => item.stock > 0).length;
  document.querySelector('#employee-count').textContent = data.employees.length;
  document.querySelector('#department-list').innerHTML = data.departments.map((item) => `<article class="department-card" style="--card-color:${item.color}"><h3>${item.name}</h3><p>${item.description}</p><span class="department-arrow">↗</span></article>`).join('');
  document.querySelector('#product-list').innerHTML = data.products.map((item) => `<tr><td class="stock-name">${item.name}</td><td class="stock-category">${item.category}</td><td>${item.stock}</td><td><span class="status ${item.status === 'Disponível' ? 'available' : item.status === 'Estoque baixo' ? 'low' : 'empty'}">${item.status}</span></td></tr>`).join('');
  document.querySelector('#employee-list').innerHTML = data.employees.map((item) => `<div class="employee"><span class="employee-avatar">${item.initials}</span><div><strong>${item.name}</strong><small>${item.role} · ${item.department}</small></div></div>`).join('');
}

function showDashboard(user) {
  authView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  document.querySelector('#floating-logout-button').classList.remove('hidden');
  document.querySelector('#user-name').textContent = user.name;
  document.querySelector('#user-email').textContent = user.email;
  document.querySelector('#welcome-name').textContent = user.name.split(' ')[0];
  document.querySelector('#user-avatar').textContent = user.name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();
  loadDashboard().catch((error) => console.error(error));
}

function showLogin(messageText = '') {
  dashboardView.classList.add('hidden');
  authView.classList.remove('hidden');
  document.querySelector('#floating-logout-button').classList.add('hidden');
  authForm.reset();
  setMode('login');
  setMessage(messageText, Boolean(messageText));
  document.querySelector('#email').focus();
}

async function logout(event) {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    await request('/api/auth/logout', { method: 'POST' });
    showLogin('Sessão encerrada. Faça login novamente para continuar.');
  } catch (error) {
    setMessage(error.message);
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll('#logout-button, #floating-logout-button').forEach((button) => button.addEventListener('click', logout));

request('/api/me').then((data) => { if (data.user) showDashboard(data.user); }).catch(() => {});
