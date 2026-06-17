import React, { FormEvent, useState } from 'react';
import { Eye, EyeOff, LockKeyhole, LogIn, UserRound } from 'lucide-react';
import { OutWayLogo } from '../../core/bars/Sidebar';

interface LoginPageProps {
  onLogin: (login: string, password: string) => Promise<boolean>;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    const ok = await onLogin(login, password);
    setLoading(false);
    if (!ok) setError('Неверный логин или пароль');
  };

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="Вход в OutWay CRM">
        <div className="login-brand">
          <OutWayLogo width={210} height={54} />
        </div>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <span>Логин</span>
            <div className="login-input">
              <UserRound size={18} />
              <input
                value={login}
                onChange={event => setLogin(event.target.value)}
                autoComplete="username"
                autoFocus
              />
            </div>
          </label>

          <label className="login-field">
            <span>Пароль</span>
            <div className="login-input">
              <LockKeyhole size={18} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="current-password"
              />
              <button
                className="login-password-toggle"
                type="button"
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                onClick={() => setShowPassword(value => !value)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="login-submit" type="submit" disabled={loading}>
            <LogIn size={18} />
            <span>{loading ? 'Проверяем...' : 'Войти'}</span>
          </button>
        </form>
      </section>
    </main>
  );
}
