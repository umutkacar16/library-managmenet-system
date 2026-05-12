import React, { useState } from 'react';
import BarcodeScannerComponent from "react-qr-barcode-scanner";
import { useNavigate } from 'react-router-dom';

function BookScanner() {
  const [data, setData] = useState('');
  const [scanActive, setScanActive] = useState(false);
  const navigate = useNavigate();

  const handleResult = (result) => {
    if (result) {
      setData(result.text);
      setScanActive(false);
      navigate(`/books?q=${encodeURIComponent(result.text)}`);
    }
  };

  return (
    <div style={{ background: 'var(--bg-panel)', padding: '24px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
      <h3 style={{ marginTop: 0, color: 'var(--text-main)' }}>Barkod ile Arama</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
        Kamera ile kitabın barkodunu okutun.
      </p>
      {scanActive ? (
        <div style={{ maxWidth: '380px', margin: '0 auto', border: '2px solid var(--primary)', borderRadius: '8px', overflow: 'hidden' }}>
          <BarcodeScannerComponent
            width="100%"
            height="100%"
            onUpdate={(err, result) => handleResult(result)}
          />
          <div style={{ padding: '8px', textAlign: 'center' }}>
            <button className="text-btn" onClick={() => setScanActive(false)}>Kamerayı Kapat</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={() => setScanActive(true)}>
          Kamerayı Ac ve Okut
        </button>
      )}
      {data && (
        <div style={{ marginTop: '16px', padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>Son okunan: </span>
          <span style={{ color: 'var(--success)', fontWeight: '600', fontFamily: 'monospace' }}>{data}</span>
        </div>
      )}
    </div>
  );
}

export default BookScanner;
