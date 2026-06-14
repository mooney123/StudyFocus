import React, { useState } from 'react';
import { useLanguage } from '../context/LanguageContext';
import './Auth.css';

const Signup = ({ onSignup, switchToLogin }) => {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
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

    // Validate passwords match
    if (formData.password !== formData.confirmPassword) {
      setError(t('auth.passwordsNoMatch'));
      setLoading(false);
      return;
    }

    // Validate password length
    if (formData.password.length < 6) {
      setError(t('auth.passwordTooShort'));
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:3001/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Store user data and token
        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.setItem('token', data.token);
        onSignup(data.user);
      } else {
        setError(data.error || t('auth.signupFailed'));
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
            Join thousands of students who study smarter, stay consistent, and reach their goals.
          </p>
          <ul className="auth-feature-list">
            <li className="auth-feature-item">
              <span className="auth-feature-icon">🎯</span>
              <span>Set goals and build daily study habits</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">📅</span>
              <span>Upload your timetable — AI plans your week</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">💬</span>
              <span>Message and study with friends</span>
            </li>
            <li className="auth-feature-item">
              <span className="auth-feature-icon">🏆</span>
              <span>Climb the leaderboard with study streaks</span>
            </li>
          </ul>
        </div>
        <div className="auth-brand-glow" />
      </div>

      {/* ── Right form panel ── */}
      <div className="auth-form-panel">
        <div className="auth-card">

          <div className="auth-header">
            <h1 className="auth-title">{t('auth.joinStudyFocus')}</h1>
            <p className="auth-subtitle">{t('auth.createAccount')}</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="name" className="form-label">{t('auth.fullName')}</label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="form-input"
                placeholder={t('auth.enterFullName')}
                required
              />
            </div>

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
                placeholder={t('auth.createPassword')}
                required
                minLength="6"
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">{t('auth.confirmPassword')}</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className="form-input"
                placeholder={t('auth.confirmPasswordPlaceholder')}
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
                  {t('auth.creatingAccount')}
                </span>
              ) : t('auth.createAccountBtn')}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-switch">
              {t('auth.haveAccount')}{' '}
              <button
                type="button"
                className="auth-link"
                onClick={switchToLogin}
              >
                {t('auth.signIn')}
              </button>
            </p>
          </div>

        </div>
      </div>

    </div>
  );
};

export default Signup;
