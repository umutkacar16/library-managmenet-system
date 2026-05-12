import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Auth from './components/Auth';
import Rooms from './components/Rooms';
import Books from './components/Books';
import StaffPanel from './components/StaffPanel';
import AdminDashboard from './components/AdminDashboard';
import BookScanner from './components/BookScanner';
import Profile from './components/Profile';
import './App.css';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return (
      <div style={{ textAlign: 'center', marginTop: '80px', color: 'var(--danger)' }}>
        <h2>Erisim Reddedildi</h2>
        <p>Bu sayfaya erisim yetkiniz bulunmamaktadir.</p>
      </div>
    );
  }
  return children;
}

function Navbar() {
  const { user, logout } = useAuth();

  const trustColor = (score) => {
    if (!score && score !== 0) return 'var(--text-muted)';
    if (score < 30) return 'var(--danger)';
    if (score > 80) return 'var(--success)';
    return 'var(--warning)';
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">BetikBil Kütüphane Sistemi</Link>

      <div className="navbar-links">
        <Link to="/" className="nav-link">Ana Sayfa</Link>
        <Link to="/books" className="nav-link">Kitaplar</Link>
        <Link to="/rooms" className="nav-link">Calisma Odalari</Link>
        
        {user && (
          <Link to="/profile" className="nav-link">Profilim</Link>
        )}

        {user && (user.role === 'staff' || user.role === 'admin') && (
          <Link to="/staff" className="nav-link nav-link-staff">Gorevli Paneli</Link>
        )}
        {user && user.role === 'admin' && (
          <Link to="/admin" className="nav-link nav-link-admin">Yonetici</Link>
        )}
      </div>

      <div className="navbar-auth">
        {user ? (
          <>
            <span className="nav-user-info">
              {user.username}
              {['member', 'student', 'teacher'].includes(user.role) && (
                <span className="nav-trust-badge" style={{ color: trustColor(user.trust_score) }}>
                  {user.trust_score} puan
                </span>
              )}
              {!['member', 'student', 'teacher'].includes(user.role) && (
                <span className="nav-role-badge">{user.role === 'staff' ? 'Gorevli' : 'Yonetici'}</span>
              )}
            </span>
            <button className="btn btn-logout" onClick={logout}>Cikis</button>
          </>
        ) : (
          <Link to="/auth" className="btn btn-primary nav-btn">Oturum Ac</Link>
        )}
      </div>
    </nav>
  );
}

function Home() {
  const { user } = useAuth();
  return (
    <div className="glass-panel home-panel">
      <h1>BetikBil Kütüphane Sistemi</h1>
      {user ? (
        <p style={{ color: 'var(--text-muted)' }}>
          Merhaba <strong style={{ color: 'var(--text-main)' }}>{user.username}</strong>.
          Kitap aramak icin <Link to="/books" style={{ color: 'var(--primary)' }}>Kitaplar</Link> sayfasini,
          oda rezervasyonu icin <Link to="/rooms" style={{ color: 'var(--primary)' }}>Calisma Odalari</Link> sayfasini kullanabilirsiniz.
        </p>
      ) : (
        <p style={{ color: 'var(--text-muted)' }}>
          Sistemi kullanmak icin lutfen <Link to="/auth" style={{ color: 'var(--primary)' }}>oturum acin</Link>.
          Kitap araması yapmak için <Link to="/books" style={{ color: 'var(--primary)' }}>Kitaplar</Link> sayfasi herkese aciktir.
        </p>
      )}
      <div style={{ marginTop: '30px' }}>
        <BookScanner />
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <div className="page-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/books" element={<Books />} />
            <Route path="/profile" element={
              <ProtectedRoute allowedRoles={['member', 'student', 'teacher', 'staff', 'admin']}>
                <Profile />
              </ProtectedRoute>
            } />
            <Route path="/rooms" element={
              <ProtectedRoute allowedRoles={['member', 'student', 'teacher', 'staff', 'admin']}>
                <Rooms />
              </ProtectedRoute>
            } />
            <Route path="/staff" element={
              <ProtectedRoute allowedRoles={['staff', 'admin']}>
                <StaffPanel />
              </ProtectedRoute>
            } />
            <Route path="/admin" element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
