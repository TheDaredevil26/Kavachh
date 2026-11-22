import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, QrCode, AlertCircle, Camera } from 'lucide-react';
import Button from '../../components/Button';
import Banner from '../../components/Banner';
import { api } from '../../services/api';
import { haptic } from '../../lib/haptics';

export default function QrCheckIn() {
  const navigate = useNavigate();

  const [scanning, setScanning] = useState(false);
  const [successData, setSuccessData] = useState(null);
  const [error, setError] = useState(null);
  const [mockStoreCode, setMockStoreCode] = useState('DS-KOR-560034-7B9A');

  const handleSimulateScan = async () => {
    setError(null);
    haptic('selection');
    setScanning(true);

    try {
      // In mobile PWA, html5-qrcode scans the dynamic dark store QR
      // For immediate dev & test verification, we send signed dark store payload
      const res = await api.qrCheckIn({
        qr_code_data: mockStoreCode,
        latitude: 12.9352,
        longitude: 77.6245,
      });

      haptic('success');
      setSuccessData({
        storeName: res?.darkStore?.name || 'Koramangala Hub #4',
        time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      });
    } catch (err) {
      setError(err.message || 'Check-in failed. Please ensure you are within 200m of the store.');
      haptic('error');
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6 pb-24 max-w-xl mx-auto">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            haptic('selection');
            navigate(-1);
          }}
          className="w-10 h-10 rounded-full glass-1 flex items-center justify-center text-ink"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-extrabold text-2xl text-ink">Dark Store Check-In</h1>
      </div>

      {error && <Banner variant="danger">{error}</Banner>}

      {successData ? (
        <div className="glass-1 p-8 rounded-hero text-center space-y-4 shadow-glass">
          <div className="w-16 h-16 rounded-full bg-sage flex items-center justify-center text-walnut mx-auto">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="font-display font-extrabold text-2xl text-ink">Checked In!</h2>
          <p className="text-sm font-semibold text-ink/72">
            Verified at <span className="font-bold text-ink">{successData.storeName}</span> at {successData.time}.
          </p>
          <div className="pt-2">
            <Button variant="primary" onClick={() => navigate('/home')}>
              Return to Home
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Camera Viewfinder Mock */}
          <div className="relative aspect-square max-w-sm mx-auto rounded-sheet glass-2 border-2 border-biscuit flex flex-col items-center justify-center p-6 text-center overflow-hidden shadow-float">
            <div className="absolute inset-8 border-2 border-dashed border-walnut/60 rounded-hero pointer-events-none" />
            <div className="w-16 h-16 rounded-full bg-sand flex items-center justify-center text-walnut mb-3">
              <Camera className="w-8 h-8" />
            </div>
            <h3 className="font-display font-bold text-lg text-ink">Scan Store QR</h3>
            <p className="text-xs font-semibold text-ink/72 max-w-[200px] mt-1">
              Point your camera at the screen at your dark store counter. Code changes every 5 minutes.
            </p>
          </div>

          <div className="glass-sand p-4 rounded-card text-xs text-ink/72 leading-relaxed">
            <span className="font-bold text-ink">Why check in? </span>
            Checking in confirms your physical presence at the dispatch hub before weather disruptions occur, guaranteeing instant claim approvals.
          </div>

          <Button
            variant="primary"
            onClick={handleSimulateScan}
            loading={scanning}
            icon={QrCode}
          >
            Confirm Store Check-In
          </Button>
        </div>
      )}
    </div>
  );
}
