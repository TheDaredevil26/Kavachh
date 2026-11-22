import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    phone_number: '',
    password: '',
    tenant_slug: 'blinkit',
    platform_worker_id: '',
    zone_id: 'blr_koramangala_1',
    current_city: 'Bengaluru',
    state: 'Karnataka',
    email: '',
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'phone_number' ? value.replace(/\D/g, '') : value,
    }));
  };

  const fillDemoData = () => {
    const randNum = Math.floor(1000 + Math.random() * 9000);
    setFormData({
      name: 'Ramesh Kumar',
      phone_number: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      password: 'Password@123',
      tenant_slug: 'blinkit',
      platform_worker_id: `BLK-${randNum}`,
      zone_id: 'blr_koramangala_1',
      current_city: 'Bengaluru',
      state: 'Karnataka',
      email: `ramesh.kumar${randNum}@example.com`,
    });
    setErrorMsg('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!formData.name.trim()) {
      setErrorMsg('Please enter your full name');
      return;
    }

    if (!/^[6-9]\d{9}$/.test(formData.phone_number)) {
      setErrorMsg('Please enter a valid 10-digit Indian mobile number');
      return;
    }

    if (formData.password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long');
      return;
    }

    if (!formData.platform_worker_id.trim()) {
      setErrorMsg('Please enter your Delivery Partner ID');
      return;
    }

    setLoading(true);
    try {
      await register(formData);
      navigate('/dashboard');
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] py-10 px-4 sm:px-6 lg:px-8 bg-slate-50">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-[#5A4030] items-center justify-center text-amber-100 shadow-md mb-2">
            <svg className="w-6 h-6 fill-current" viewBox="0 0 24 24">
              <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Create Rider Account
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Register with Kavach to protect your daily earnings from extreme weather and disruptions
          </p>
        </div>

        <div className="bg-white py-7 px-6 shadow-sm border border-slate-200 rounded-2xl">
          <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100">
            <span className="text-xs font-semibold text-slate-700">Rider Onboarding Form</span>
            <button
              type="button"
              onClick={fillDemoData}
              className="text-xs text-[#5A4030] hover:text-amber-900 font-semibold bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-lg transition"
            >
              Fill Demo Data
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{errorMsg}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Full Name & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mobile Number *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 text-xs font-medium">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleChange}
                    placeholder="9876543210"
                    className="w-full text-xs pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030] font-mono"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Password * (min 8 characters)
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Choose a strong password"
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                required
              />
            </div>

            {/* Platform Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Delivery Platform *
                </label>
                <select
                  name="tenant_slug"
                  value={formData.tenant_slug}
                  onChange={handleChange}
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030] bg-white font-medium"
                  required
                >
                  <option value="blinkit">Blinkit (Zomato Commerce)</option>
                  <option value="zepto">Zepto</option>
                  <option value="swiggy_instamart">Swiggy Instamart</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Platform Partner ID *
                </label>
                <input
                  type="text"
                  name="platform_worker_id"
                  value={formData.platform_worker_id}
                  onChange={handleChange}
                  placeholder="e.g. BLK-89212"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030] font-mono"
                  required
                />
              </div>
            </div>

            {/* Zone & City */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Base Delivery Zone *
                </label>
                <input
                  type="text"
                  name="zone_id"
                  value={formData.zone_id}
                  onChange={handleChange}
                  placeholder="blr_koramangala_1"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030] font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  name="current_city"
                  value={formData.current_city}
                  onChange={handleChange}
                  placeholder="Bengaluru"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  State
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleChange}
                  placeholder="Karnataka"
                  className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
                />
              </div>
            </div>

            {/* Email (Optional) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="rider@example.com"
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#5A4030]"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-[#5A4030] hover:bg-[#483326] shadow-sm disabled:opacity-50 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Registering Account...</span>
                </>
              ) : (
                'Create Account & Continue'
              )}
            </button>
          </form>

          <div className="mt-5 text-center">
            <span className="text-xs text-slate-500">Already registered? </span>
            <Link to="/login" className="text-xs font-semibold text-[#5A4030] hover:underline">
              Sign in to your account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
