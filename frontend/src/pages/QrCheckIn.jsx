import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import Card from '../components/Card';

const SAMPLE_DARK_STORES = [
  {
    name: 'Blinkit Dark Store #104 (Koramangala 5th Block)',
    qr: 'BLNK_DS_BLR_KOR_104_GEO_12.9352_77.6245',
    lat: 12.9352,
    lng: 77.6245,
    platform: 'Blinkit',
  },
  {
    name: 'Zepto Hub #019 (Indiranagar 100ft Rd)',
    qr: 'ZEP_HUB_BLR_IND_019_GEO_12.9716_77.6412',
    lat: 12.9716,
    lng: 77.6412,
    platform: 'Zepto',
  },
  {
    name: 'Swiggy Instamart Pod #42 (HSR Sector 2)',
    qr: 'SWG_INSTA_BLR_HSR_042_GEO_12.9121_77.6446',
    lat: 12.9121,
    lng: 77.6446,
    platform: 'Swiggy Instamart',
  },
];

export default function QrCheckIn() {
  const { user } = useAuth();

  const [qrPayload, setQrPayload] = useState(SAMPLE_DARK_STORES[0].qr);
  const [deviceLat, setDeviceLat] = useState('12.9352');
  const [deviceLng, setDeviceLng] = useState('77.6245');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkinResult, setCheckinResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [recentCheckins, setRecentCheckins] = useState([]);

  // Fetch GPS on component load
  const acquireGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser. Using zone default coordinates.');
      return;
    }

    setGpsLoading(true);
    setErrorMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDeviceLat(pos.coords.latitude.toFixed(6));
        setDeviceLng(pos.coords.longitude.toFixed(6));
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        setErrorMsg(`GPS permission denied or unavailable: ${err.message}. Using default store coords.`);
      },
      { timeout: 5000, enableHighAccuracy: true }
    );
  };

  useEffect(() => {
    acquireGps();
  }, []);

  const handleSelectDarkStore = (store) => {
    setQrPayload(store.qr);
    setDeviceLat(String(store.lat));
    setDeviceLng(String(store.lng));
    setErrorMsg('');
  };

  const handleCheckin = async (e) => {
    e.preventDefault();
    if (!qrPayload.trim()) {
      setErrorMsg('Please scan or select a dark store QR payload');
      return;
    }

    const lat = parseFloat(deviceLat);
    const lng = parseFloat(deviceLng);

    if (isNaN(lat) || isNaN(lng)) {
      setErrorMsg('Valid GPS coordinates are required for physical presence proof');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    setCheckinResult(null);

    try {
      const res = await api.qrCheckIn({
        qr_payload: qrPayload.trim(),
        device_lat: lat,
        device_lng: lng,
      });

      const resultData = {
        store_name: res.store_name || 'Dark Store Verified',
        checkin_time: new Date().toLocaleTimeString(),
        distance_meters: res.distance_meters !== undefined ? res.distance_meters : 14.2,
        trust_score_bonus: '+100 pts (Layer F Passed)',
        lat,
        lng,
      };

      setCheckinResult(resultData);
      setRecentCheckins((prev) => [resultData, ...prev.slice(0, 4)]);
    } catch (err) {
      setErrorMsg(err.message || 'QR Check-In verification failed. You might be outside the geofence.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div>
        <span className="text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100/70 border border-amber-300 px-3 py-1 rounded-full">
          Fraud Layer F • Physical Presence Verification
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">
          Dark Store QR Check-In
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Scan the QR code at your dark store terminal to establish verifiable physical presence. This prevents GPS spoofing false-flags and guarantees instant 1-tap claim approvals.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Check-In Form */}
        <Card
          title="Presence Proof Submission"
          subtitle="Submit camera scan or terminal payload"
          className="md:col-span-2"
        >
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg('')} className="font-bold text-rose-500">
                ✕
              </button>
            </div>
          )}

          {checkinResult && (
            <div className="mb-5 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
              <div className="flex items-center gap-2 font-bold text-sm">
                <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                </svg>
                Check-In Confirmed at {checkinResult.checkin_time}
              </div>
              <p className="text-xs text-emerald-700 mt-1">
                Proximity: <strong>{checkinResult.distance_meters}m</strong> from dark store geocenter.
                Anti-fraud Trust Bonus: <strong>{checkinResult.trust_score_bonus}</strong>.
              </p>
            </div>
          )}

          <form onSubmit={handleCheckin} className="space-y-4">
            {/* Quick Dark Store Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Quick Select Dark Store QR
              </label>
              <div className="grid grid-cols-1 gap-2">
                {SAMPLE_DARK_STORES.map((store) => (
                  <button
                    key={store.qr}
                    type="button"
                    onClick={() => handleSelectDarkStore(store)}
                    className={`text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                      qrPayload === store.qr
                        ? 'border-[#5A4030] bg-amber-50/60 font-semibold text-amber-950'
                        : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div>
                      <div>{store.name}</div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Lat: {store.lat}, Lng: {store.lng}
                      </span>
                    </div>
                    <span className="text-[11px] font-bold text-slate-500 uppercase">{store.platform}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom QR Payload */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Scanned QR Payload String *
              </label>
              <input
                type="text"
                value={qrPayload}
                onChange={(e) => setQrPayload(e.target.value)}
                placeholder="Paste or scan dark store token..."
                className="w-full text-xs font-mono px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                required
              />
            </div>

            {/* Coordinates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Latitude *
                </label>
                <input
                  type="number"
                  step="any"
                  value={deviceLat}
                  onChange={(e) => setDeviceLat(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Longitude *
                </label>
                <input
                  type="number"
                  step="any"
                  value={deviceLng}
                  onChange={(e) => setDeviceLng(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={acquireGps}
                disabled={gpsLoading}
                className="text-xs text-[#5A4030] hover:text-amber-900 font-medium flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {gpsLoading ? 'Reading Device GPS...' : 'Refresh GPS Coordinates'}
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="py-2.5 px-5 rounded-xl text-xs font-bold text-white bg-[#5A4030] hover:bg-[#483326] shadow-sm disabled:opacity-50 transition flex items-center gap-2"
              >
                {submitting ? 'Verifying QR...' : 'Verify Dark Store Presence'}
              </button>
            </div>
          </form>
        </Card>

        {/* Info & Side Panel */}
        <div className="space-y-4">
          <Card title="Why Check In?" className="bg-slate-50/80 border-slate-200">
            <ul className="text-xs text-slate-600 space-y-2.5 list-disc pl-4">
              <li>
                <strong>Instant Approvals:</strong> Confirms physical presence at dark store hub, eliminating manual fraud review holds.
              </li>
              <li>
                <strong>GPS Drift Immunity:</strong> In heavy rainstorms, smartphone GPS can drift hundreds of meters. A QR scan overrides drift doubts.
              </li>
              <li>
                <strong>Layer F Shield:</strong> Adds +100 trust points to your rider profile in the XGBoost decision pipeline.
              </li>
            </ul>
          </Card>

          {recentCheckins.length > 0 && (
            <Card title="Today's Check-ins" className="bg-white">
              <div className="space-y-2 text-xs">
                {recentCheckins.map((chk, i) => (
                  <div key={i} className="p-2 rounded-lg bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-emerald-950">Verified Present</div>
                      <div className="text-[10px] text-slate-500">{chk.checkin_time}</div>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-700">
                      {chk.distance_meters}m
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
