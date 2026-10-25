// Giriş / kayıt formları. Şifre hiçbir zaman tarayıcıda saklanmaz.
// "Beni hatırla" yalnızca e-posta adresini hatırlar.
import { signIn, signUp } from './api.js';
import { validateName, validateEmail, validatePassword, validateAddress, validatePhone } from './lib.js';
import { toast, $, setBusy, setFormError, closeModal } from './ui.js';

const REMEMBER_KEY = 'eb_remembered_email';

function setMode(mode) {
  const isLogin = mode === 'login';
  $('login-form').hidden = !isLogin;
  $('register-form').hidden = isLogin;
  $('auth-title').textContent = isLogin ? 'Giriş Yap' : 'Hesap Oluştur';
  setFormError($('login-error'), '');
  setFormError($('register-error'), '');
}

async function handleLogin(e) {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const btn = $('login-submit');
  const err = validateEmail(email) || (password ? null : 'Şifre gerekli.');
  setFormError($('login-error'), err || '');
  if (err) return;

  setBusy(btn, true, 'Giriş yapılıyor…');
  try {
    await signIn(email, password);
    try {
      if ($('remember-me').checked) localStorage.setItem(REMEMBER_KEY, email);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch { /* yoksay */ }
    $('login-password').value = '';
    closeModal('auth-modal');
    toast('Giriş yapıldı.');
  } catch (error) {
    setFormError($('login-error'), error.message);
  } finally {
    setBusy(btn, false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const fullName = $('reg-fullname').value.trim();
  const email = $('reg-email').value.trim();
  const password = $('reg-password').value;
  const phone = $('reg-phone').value.trim();
  const address = $('reg-address').value.trim();
  const btn = $('register-submit');

  const err = validateName(fullName) || validateEmail(email) || validatePassword(password)
    || validatePhone(phone) || validateAddress(address);
  setFormError($('register-error'), err || '');
  if (err) return;

  setBusy(btn, true, 'Hesap oluşturuluyor…');
  try {
    const { needsEmailConfirmation } = await signUp({ email, password, fullName, phone, address });
    $('register-form').reset();
    if (needsEmailConfirmation) {
      toast('Hesabınız oluşturuldu. Lütfen e-postanıza gelen doğrulama bağlantısını onaylayın.');
      setMode('login');
    } else {
      toast('Hesabınız oluşturuldu, hoş geldiniz!');
      closeModal('auth-modal');
    }
  } catch (error) {
    setFormError($('register-error'), error.message);
  } finally {
    setBusy(btn, false);
  }
}

export function initAuthForms() {
  $('login-form')?.addEventListener('submit', handleLogin);
  $('register-form')?.addEventListener('submit', handleRegister);
  $('show-register')?.addEventListener('click', () => setMode('register'));
  $('show-login')?.addEventListener('click', () => setMode('login'));

  try {
    const remembered = localStorage.getItem(REMEMBER_KEY);
    if (remembered) $('login-email').value = remembered;
  } catch { /* yoksay */ }
  setMode('login');
}

export function openAuth(mode = 'login') {
  setMode(mode);
}
