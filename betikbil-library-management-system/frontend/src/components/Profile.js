import React, { useState, useEffect } from 'react';
import { useAuth, authFetch } from '../context/AuthContext';
import './Profile.css';

function Profile() {
  const { token, user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchProfile = async () => {
    try {
      const res = await authFetch(token, 'http://localhost:5000/api/profile');
      if (res.ok) {
        setProfileData(await res.json());
      }
    } catch {}
  };

  useEffect(() => {
    if (token) fetchProfile();
  }, [token]);

  const showMsg = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 5000);
  };

  const handleAddBalance = async (e) => {
    e.preventDefault();
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      showMsg('error:Geçerli bir tutar giriniz.');
      return;
    }
    setLoading(true);
    try {
      const res = await authFetch(token, 'http://localhost:5000/api/profile/add-balance', {
        method: 'POST',
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(`ok:${data.message}`);
        setAmount('');
        fetchProfile(); // refresh data
      } else {
        showMsg(`error:${data.error}`);
      }
    } catch {
      showMsg('error:Sunucuya bağlanılamadı.');
    }
    setLoading(false);
  };

  if (!profileData) return <div style={{ textAlign: 'center', marginTop: '60px', color: 'var(--text-muted)' }}>Yükleniyor...</div>;

  const [msgType, msgText] = msg ? msg.split(':') : ['', ''];
  const debt = parseFloat(profileData.total_debt);
  const isCredit = debt < 0;

  return (
    <div className="profile-container fade-in">
      <h2>Profilim</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>Hesap durumunuz ve bakiye işlemleriniz.</p>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: '8px', marginBottom: '20px', fontSize: '0.875rem', fontWeight: '500',
          background: msgType === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          color: msgType === 'ok' ? 'var(--success)' : 'var(--danger)',
          border: `1px solid ${msgType === 'ok' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
          {msgText}
        </div>
      )}

      <div className="profile-grid">
        <div className="glass-panel profile-card">
          <div className="profile-avatar">
            {profileData.username.charAt(0).toUpperCase()}
          </div>
          <h3>{profileData.username}</h3>
          <span className="profile-role">Rol: {profileData.role}</span>
          
          <div className="profile-stats">
            <div className="stat-box">
              <span className="stat-value">{profileData.trust_score}</span>
              <span className="stat-label">Güven Skoru</span>
            </div>
            <div className="stat-box">
              <span className={`stat-value ${isCredit ? 'credit' : debt > 0 ? 'debt' : ''}`}>
                {isCredit ? '+' : ''}{Math.abs(debt).toFixed(2)} TL
              </span>
              <span className="stat-label">{isCredit ? 'Sanal Bakiye' : debt > 0 ? 'Mevcut Borç' : 'Borç/Bakiye'}</span>
            </div>
          </div>
        </div>

        <div className="glass-panel balance-card">
          <h3>Sanal Bakiye Yükle / Borç Öde</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '20px' }}>
            Sisteme yüklediğiniz bakiye, var olan borçlarınızdan düşülür. Kalan tutar gelecekteki bilgisayar odası veya gecikme cezaları için cüzdanınızda saklanır.
          </p>

          <form onSubmit={handleAddBalance} className="balance-form">
            <div className="input-group">
              <label>Yüklenecek Tutar (TL)</label>
              <input 
                type="number" 
                placeholder="Örn: 50" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)}
                min="1"
                step="0.01"
              />
            </div>
            
            {/* Mock Credit Card UI just for looks */}
            <div className="mock-cc">
              <div className="cc-row">
                <input type="text" placeholder="Kart Numarası (Demo)" disabled />
              </div>
              <div className="cc-row-split">
                <input type="text" placeholder="AA/YY" disabled />
                <input type="text" placeholder="CVC" disabled />
              </div>
            </div>

            <button type="submit" className="btn btn-primary balance-submit" disabled={loading}>
              {loading ? 'İşleniyor...' : 'Bakiyeyi Yükle'}
            </button>
          </form>
        </div>
      </div>

      {/* History Section */}
      <div className="profile-history-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '24px' }}>
        
        {/* Payments History */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Finansal Geçmiş</h3>
          {(!profileData.payments || profileData.payments.length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Henüz bir finansal hareket bulunmuyor.</p>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '300px', paddingRight: '5px' }}>
              {profileData.payments.map((p, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                  <div>
                    <div style={{ fontWeight: '600', color: p.type === 'charge' ? 'var(--danger)' : 'var(--success)' }}>
                      {p.type === 'charge' ? 'Ceza / Kesinti' : 'Ödeme / Yükleme'}
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{p.description}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700' }}>{p.type === 'charge' ? '-' : '+'}{parseFloat(p.amount).toFixed(2)} TL</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                      {new Date(p.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Trust Score History */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ marginBottom: '16px', fontSize: '1.1rem' }}>Güven Skoru Geçmişi</h3>
          {(!profileData.trust_score_history || profileData.trust_score_history.length === 0) ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Henüz puan hareketi bulunmuyor.</p>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '300px', paddingRight: '5px' }}>
              {profileData.trust_score_history.map((t, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '0.85rem' }}>
                  <div>
                    <div style={{ fontWeight: '600' }}>{t.reason}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700', color: t.delta > 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {t.delta > 0 ? '+' : ''}{t.delta} Puan
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: '2px' }}>
                      {new Date(t.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Profile;
