import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudRain, ShieldCheck, Zap } from 'lucide-react';
import Button from '../components/Button';
import KavachShield from '../assets/KavachShield';
import { haptic } from '../lib/haptics';

const LANGUAGES = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', native: 'मराठी' },
];

const SLIDES = [
  {
    icon: CloudRain,
    title: 'Rain stops orders. Not your pay.',
    desc: 'When bad weather cuts your work, Kavach pays you automatically.',
  },
  {
    icon: ShieldCheck,
    title: 'No forms. No waiting in line.',
    desc: 'We watch rain, heat, air quality, curfews, and store outages for your dark store.',
  },
  {
    icon: Zap,
    title: 'One swipe, money in your bank.',
    desc: 'Swipe to claim. Watch it arrive directly in your bank account, live.',
  },
];

export default function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState('language'); // 'language' | 'slides'
  const [selectedLang, setSelectedLang] = useState('en');
  const [slideIndex, setSlideIndex] = useState(0);

  const handleLanguageSelect = (code) => {
    haptic('selection');
    setSelectedLang(code);
    localStorage.setItem('kavach_language', code);
  };

  const handleNextSlide = () => {
    haptic('selection');
    if (slideIndex < SLIDES.length - 1) {
      setSlideIndex(slideIndex + 1);
    } else {
      navigate('/signup');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-6 max-w-md mx-auto">
      {/* Top Brand Logo */}
      <div className="pt-8 flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-walnut flex items-center justify-center shadow-press mb-4">
          <KavachShield className="w-9 h-9 text-oat" />
        </div>
        <h1 className="font-display font-extrabold text-3xl text-ink tracking-tight">Kavach</h1>
        <p className="text-sm font-semibold text-ink/72 mt-1">Income Cover for Delivery Riders</p>
      </div>

      <AnimatePresence mode="wait">
        {step === 'language' ? (
          <motion.div
            key="language"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex flex-col justify-center my-6"
          >
            <h2 className="font-display font-bold text-2xl text-ink mb-4 text-center">
              Pick your language
            </h2>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.code;
                return (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageSelect(lang.code)}
                    className={`h-16 rounded-row px-4 flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-sky text-ink border-2 border-walnut shadow-glass font-bold'
                        : 'glass-1 text-ink/72 hover:bg-white/60'
                    }`}
                  >
                    <span className="text-lg font-bold">{lang.native}</span>
                    <span className="text-xs opacity-75">{lang.name}</span>
                  </button>
                );
              })}
            </div>

            <Button
              variant="primary"
              onClick={() => {
                haptic('success');
                setStep('slides');
              }}
            >
              Continue
            </Button>
          </motion.div>
        ) : (
          <motion.div
            key="slides"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="flex-1 flex flex-col justify-center my-6 text-center"
          >
            <div className="flex justify-end mb-4">
              <button
                onClick={() => navigate('/login')}
                className="text-sm font-bold text-ink/72 hover:text-ink underline"
              >
                Skip
              </button>
            </div>

            <div className="glass-1 p-8 rounded-hero shadow-glass mb-8">
              {(() => {
                const CurrentIcon = SLIDES[slideIndex].icon;
                return (
                  <div className="flex flex-col items-center">
                    <div className="w-16 h-16 rounded-full bg-powder flex items-center justify-center text-walnut mb-6">
                      <CurrentIcon className="w-8 h-8" />
                    </div>
                    <h2 className="font-display font-extrabold text-2xl text-ink mb-3 leading-snug">
                      {SLIDES[slideIndex].title}
                    </h2>
                    <p className="font-sans text-base text-ink/72 leading-relaxed">
                      {SLIDES[slideIndex].desc}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* Pagination Dots */}
            <div className="flex justify-center gap-2 mb-6">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i === slideIndex ? 'w-8 bg-walnut' : 'w-2 bg-biscuit/60'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-3">
              <Button variant="primary" onClick={handleNextSlide}>
                {slideIndex === SLIDES.length - 1 ? 'Create account' : 'Next'}
              </Button>
              {slideIndex === SLIDES.length - 1 && (
                <Button variant="ghost" onClick={() => navigate('/login')}>
                  I already have an account
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-center text-xs text-ink/48 pb-2">
        Kavach Prototype — Not affiliated with Blinkit, Zepto, or Swiggy
      </div>
    </div>
  );
}
