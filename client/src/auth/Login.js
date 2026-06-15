import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Auth.css';

const Login = ({ onLogin, switchToSignup }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError(''); // Clear error when user types
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (response.ok) {
        // Store user data and token
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        onLogin(data.user);
      } else {
        setError(data.error || t('auth.loginFailed'));
      }
    } catch (err) {
      setError(t('auth.networkError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      {/* ── Left branding panel ── */}
      <div className="auth-brand-panel">
        <div className="auth-brand-inner">
          <div className="auth-brand-logo-row">
            <span className="auth-brand-emoji">📚</span>
            <span className="auth-brand-name">StudyFocus</span>
          </div>
          <p className="auth-brand-tagline">
            Your personal study productivity hub — stay focused, track progress, and achieve more.
          </p>
          <ul className="auth-feature-list">
            <li className="auth-feature-item">
              <span className="auth-feature-icon">⏱</span>
              <span>Pomodoro timer &amp; focused study sessions</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">👥</span>
              <span>Study together with friends in real time</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">🤖</span>
              <span>AI-powered schedule &amp; timetable planning</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">📊</span>
              <span>Analytics, streaks &amp; leaderboard</span>
            </li>
          </ul>
        </div>
        <div className="auth-brand-glow" />
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-form-panel">
        <div className="auth-card">

          <div className="auth-header">
            <h1 className="auth-title">{t('auth.welcomeBack')}</h1>
            <p className="auth-subtitle">{t('auth.signInTo')}</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="email" className="form-label">{t('auth.email')}</label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className="form-input"
                placeholder={t('auth.enterEmail')}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">{t('auth.password')}</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className="form-input"
                placeholder={t('auth.enterPassword')}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-button primary"
              disabled={loading}
            >
              {loading ? (
                <span className="auth-button-inner">
                  <span className="auth-spinner" />
                  {t('auth.signingIn')}
                </span>
              ) : t('auth.signIn')}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-switch">
              {t('auth.noAccount')}{' '}
              <button
                type="button"
                className="auth-link"
                onClick={switchToSignup}
              >
                {t('auth.signUp')}
              </button>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Login;
