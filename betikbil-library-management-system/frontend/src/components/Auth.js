import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Auth.css';

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    try {
      const bodyParams = { username, password };
      if (!isLogin) {
        bodyParams.role = role;
      }
      const res = await fetch(`http://localhost:5000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyParams)
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Bir hata olustu');
      } else {
        login(data.token, data.user);
        navigate('/');
      }
    } catch {
      setError('Sunucuya baglanılamiyor. Backend calistigindan emin olun.');
    }
    setLoading(false);
  };

  const fillDemo = (u) => { setUsername(u); setPassword(u); };

  return (
    <div className="auth-container">
      <div className="glass-panel auth-panel fade-in">
        <h2 className="auth-title">{isLogin ? 'Oturum Ac' : 'Hesap Olustur'}</h2>
        <p className="auth-subtitle">
          {isLogin ? 'BetikBil Kütüphane Sistemine tekrar hoşgeldiniz.' : 'Yeni hesabınızı oluşturun.'}
        </p>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="auth-username">Kullanici Adi</label>
            <input
              type="text"
              id="auth-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Kullanici adiniz"
              required
            />
          </div>
          <div className="input-group">
            <label htmlFor="auth-password">Sifre</label>
            <input
              type="password"
              id="auth-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sifreniz"
              required
            />
          </div>
          {!isLogin && (
            <div className="input-group">
              <label htmlFor="auth-role">Kullanici Tipi</label>
              <select 
                id="auth-role" 
                value={role} 
                onChange={(e) => setRole(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--glass-border)', background: 'rgba(15,23,42,0.6)', color: 'white', fontSize: '0.95rem' }}
              >
                <option value="student">Ogrenci</option>
                <option value="teacher">Egitmen</option>
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? 'Lutfen bekleyin...' : (isLogin ? 'Giris Yap' : 'Kayit Ol')}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? 'Hesabiniz yok mu?' : 'Zaten hesabiniz var mi?'}
            <button className="text-btn" onClick={() => { setIsLogin(!isLogin); setError(''); }}>
              {isLogin ? ' Kayit Ol' : ' Giris Yap'}
            </button>
          </p>
        </div>

        {isLogin && (
          <div className="demo-accounts">
            <p>Demo hesaplar (tiklayarak doldurun):</p>
            <div className="demo-badges" style={{ flexWrap: 'wrap', gap: '8px' }}>
              <span onClick={() => fillDemo('admin')} className="demo-badge demo-badge-admin">Admin</span>
              <span onClick={() => fillDemo('staff')} className="demo-badge demo-badge-staff">Görevli</span>
              <span onClick={() => fillDemo('student')} className="demo-badge demo-badge-member">Öğrenci</span>
              <span onClick={() => fillDemo('teacher')} className="demo-badge demo-badge-member" style={{ background: 'rgba(245,158,11,0.2)', color: 'var(--warning)', borderColor: 'rgba(245,158,11,0.4)' }}>Eğitmen</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Auth;
