import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, CloudRain, Flame, Wind, ArrowRight, Zap, Check, ChevronDown, Layers, Terminal } from 'lucide-react';
import Button from '../../components/Button';
import SwipeToConfirm from '../../components/SwipeToConfirm';
import KavachShield from '../../assets/KavachShield';
import { formatMoney } from '../../lib/format';
import { haptic } from '../../lib/haptics';

const FAQS = [
  {
    q: 'When do I get paid?',
    a: 'After you swipe to claim, most claims are checked by our parametric telemetry in seconds and sent to your bank account within minutes.',
  },
  {
    q: 'Do I need to fill in claim forms?',
    a: 'No forms, receipts, or medical bills. We monitor live rainfall sensors and dark store power status continuously for you.',
  },
  {
    q: 'What is the waiting period?',
    a: 'New policy subscriptions begin coverage 72 hours after first weekly payment to ensure fairness for the community.',
  },
  {
    q: 'What if my claim is held?',
    a: 'A desk adjudicator checks GPS telemetry within 24 hours. You can track progress live on the tracker screen.',
  },
  {
    q: 'What if the payout amount looks wrong?',
    a: 'You can raise a problem directly from the app for up to 2 hours after payout disbursement.',
  },
  {
    q: 'Is my data and location safe?',
    a: 'Your bank and phone credentials are AES-256 encrypted, and each delivery platform tenant data is strictly partitioned.',
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const [openFaq, setOpenFaq] = useState(null);
  const [demoClaimed, setDemoClaimed] = useState(false);

  const handleDemoSwipe = async () => {
    haptic('success');
    setDemoClaimed(true);
  };

  return (
    <div className="min-h-screen text-ink antialiased">
      {/* Top Floating Glass Nav */}
      <header className="sticky top-4 z-50 px-4 max-w-5xl mx-auto">
        <div className="glass-2 rounded-full px-6 py-3.5 flex items-center justify-between shadow-float">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-walnut flex items-center justify-center text-oat shadow-press">
              <KavachShield className="w-4 h-4" />
            </div>
            <span className="font-display font-extrabold text-xl text-ink tracking-tight">Kavach</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 text-sm font-bold text-ink/72">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#coverage" className="hover:text-ink">Coverage</a>
            <a href="#plans" className="hover:text-ink">Plans</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
          </nav>

          <Button
            variant="primary"
            compact
            onClick={() => navigate('/welcome')}
            className="text-xs"
          >
            Get started
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="px-6 pt-16 pb-20 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky text-xs font-bold text-ink">
              <Zap className="w-4 h-4 text-walnut" />
              <span>Parametric Income Protection for Q-Commerce</span>
            </div>

            <h1 className="font-display font-extrabold text-4xl sm:text-6xl text-ink leading-[1.08] tracking-tight">
              When rain stops the orders, Kavach pays you.
            </h1>

            <p className="font-sans text-lg text-ink/72 leading-relaxed max-w-xl">
              Automatic weekly income cover for Blinkit, Zepto, and Swiggy Instamart delivery riders. No forms. No waiting. One swipe.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="primary" onClick={() => navigate('/welcome')}>
                Get covered from ₹49/week
              </Button>
              <Button variant="secondary" onClick={() => navigate('/login')}>
                I already have an account
              </Button>
            </div>
          </div>

          {/* Interactive Phone Frame Live Hero Demo */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-[310px] rounded-sheet p-3 glass-2 shadow-float border-2 border-white/80">
              <div className="rounded-hero glass-1 p-5 space-y-4 border border-biscuit/40">
                <div className="flex items-center justify-between text-xs font-bold text-ink/72">
                  <span>Koramangala Hub</span>
                  <span className="flex items-center gap-1 text-sage">
                    <span className="w-2 h-2 rounded-full bg-sage animate-ping" /> Live
                  </span>
                </div>

                <div className="glass-sky p-4 rounded-card space-y-2">
                  <div className="flex items-center gap-2 text-walnut font-bold text-xs uppercase">
                    <CloudRain className="w-4 h-4" />
                    <span>Rain Trigger Active</span>
                  </div>
                  <div className="font-display font-extrabold text-3xl text-ink">
                    ₹350
                  </div>
                  <span className="text-[11px] font-semibold text-ink/72 block">
                    Precipitation exceeds 15 mm/hr threshold
                  </span>
                </div>

                {demoClaimed ? (
                  <div className="glass-1 p-4 rounded-card text-center space-y-2 bg-sage/30">
                    <Check className="w-6 h-6 text-walnut mx-auto" />
                    <span className="font-display font-bold text-sm text-ink block">
                      Money sent to UPI!
                    </span>
                    <span className="text-[11px] text-ink/72 block">
                      Arrived in HDFC account • Ref: IMPS-8921
                    </span>
                    <button
                      onClick={() => setDemoClaimed(false)}
                      className="text-[11px] font-bold text-ink underline pt-1"
                    >
                      Reset Demo
                    </button>
                  </div>
                ) : (
                  <SwipeToConfirm
                    label="Swipe to claim ₹350"
                    successLabel="Sent!"
                    onConfirm={handleDemoSwipe}
                  />
                )}

                <div className="text-[10px] text-ink/48 text-center">
                  Try this live swipe demonstration above
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Plain Facts */}
      <section className="py-12 bg-sand/30 border-y border-biscuit/40">
        <div className="px-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-1 p-6 rounded-card">
            <span className="font-display font-extrabold text-3xl text-walnut">5 Types</span>
            <h3 className="font-display font-bold text-lg text-ink mt-2">Disruptions Monitored</h3>
            <p className="text-xs font-semibold text-ink/72 mt-1">
              Rain, extreme heat waves, air pollution (AQI), civic curfews, and dark store halts.
            </p>
          </div>
          <div className="glass-1 p-6 rounded-card">
            <span className="font-display font-extrabold text-3xl text-walnut">&lt; 15 Mins</span>
            <h3 className="font-display font-bold text-lg text-ink mt-2">Direct UPI Settlement</h3>
            <p className="text-xs font-semibold text-ink/72 mt-1">
              No claim paperwork or receipts. Payouts arrive directly into your linked bank account.
            </p>
          </div>
          <div className="glass-1 p-6 rounded-card">
            <span className="font-display font-extrabold text-3xl text-walnut">₹49 / week</span>
            <h3 className="font-display font-bold text-lg text-ink mt-2">Accessible Pricing</h3>
            <p className="text-xs font-semibold text-ink/72 mt-1">
              Designed specifically for delivery partner unit economics. Cancel anytime.
            </p>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how" className="px-6 py-20 max-w-5xl mx-auto space-y-12">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="font-display font-extrabold text-3xl text-ink">How Kavach works</h2>
          <p className="text-sm font-semibold text-ink/72 mt-2">Three simple steps to income protection</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="glass-1 p-6 rounded-hero space-y-3">
            <div className="w-10 h-10 rounded-full bg-walnut text-oat flex items-center justify-center font-display font-bold text-lg">
              1
            </div>
            <h3 className="font-display font-bold text-xl text-ink">We monitor your store</h3>
            <p className="text-xs font-semibold text-ink/72 leading-relaxed">
              Automated sensors monitor real-time weather and dispatch status at your registered dark store zone.
            </p>
          </div>

          <div className="glass-1 p-6 rounded-hero space-y-3">
            <div className="w-10 h-10 rounded-full bg-walnut text-oat flex items-center justify-center font-display font-bold text-lg">
              2
            </div>
            <h3 className="font-display font-bold text-xl text-ink">You receive an alert</h3>
            <p className="text-xs font-semibold text-ink/72 leading-relaxed">
              When bad weather or outages exceed safety thresholds, a claim alert pops up in your app.
            </p>
          </div>

          <div className="glass-1 p-6 rounded-hero space-y-3">
            <div className="w-10 h-10 rounded-full bg-walnut text-oat flex items-center justify-center font-display font-bold text-lg">
              3
            </div>
            <h3 className="font-display font-bold text-xl text-ink">Swipe to get paid</h3>
            <p className="text-xs font-semibold text-ink/72 leading-relaxed">
              One deliberate swipe confirms your claim. Telemetry checks are processed in seconds.
            </p>
          </div>
        </div>
      </section>

      {/* Coverage Section */}
      <section id="coverage" className="px-6 py-16 bg-powder/30 border-t border-biscuit/40">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center max-w-xl mx-auto">
            <h2 className="font-display font-extrabold text-3xl text-ink">Parametric Coverage</h2>
            <p className="text-sm font-semibold text-ink/72 mt-2">Objective criteria based on verified sensor data</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="glass-1 p-5 rounded-card space-y-2">
              <CloudRain className="w-7 h-7 text-walnut" />
              <h4 className="font-display font-bold text-base text-ink">Heavy Rainfall</h4>
              <p className="text-xs text-ink/72">Triggered when rainfall exceeds 15 mm/hr in your delivery pincode.</p>
            </div>
            <div className="glass-1 p-5 rounded-card space-y-2">
              <Flame className="w-7 h-7 text-walnut" />
              <h4 className="font-display font-bold text-base text-ink">Extreme Heat</h4>
              <p className="text-xs text-ink/72">Triggered when wet-bulb temperature or heat index exceeds 40 °C.</p>
            </div>
            <div className="glass-1 p-5 rounded-card space-y-2">
              <Wind className="w-7 h-7 text-walnut" />
              <h4 className="font-display font-bold text-base text-ink">Severe Pollution</h4>
              <p className="text-xs text-ink/72">Triggered when Air Quality Index (AQI) crosses hazardous 300+ limits.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Plans Section */}
      <section id="plans" className="px-6 py-20 max-w-5xl mx-auto space-y-10">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="font-display font-extrabold text-3xl text-ink">Simple Weekly Pricing</h2>
          <p className="text-sm font-semibold text-ink/72 mt-2">Transparent weekly protection with no lock-ins</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-1 p-6 rounded-hero space-y-4">
            <span className="text-xs font-bold text-ink/72 uppercase">Basic</span>
            <div className="font-display font-extrabold text-4xl text-ink">₹49 <span className="text-sm font-sans font-bold text-ink/72">/ week</span></div>
            <div className="text-xs font-semibold text-ink/72 space-y-2">
              <div>• ₹200 per disruption</div>
              <div>• Up to 3 payout days / month</div>
              <div>• Rain & Extreme Heat</div>
            </div>
            <Button variant="secondary" onClick={() => navigate('/welcome')}>Select Basic</Button>
          </div>

          <div className="glass-1 p-6 rounded-hero space-y-4 border-2 border-walnut shadow-float relative">
            <div className="absolute -top-3 right-6 bg-walnut text-oat text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
              Most Popular
            </div>
            <span className="text-xs font-bold text-ink/72 uppercase">Standard</span>
            <div className="font-display font-extrabold text-4xl text-ink">₹89 <span className="text-sm font-sans font-bold text-ink/72">/ week</span></div>
            <div className="text-xs font-semibold text-ink/72 space-y-2">
              <div>• ₹350 per disruption</div>
              <div>• Up to 4 payout days / month</div>
              <div>• Rain, Heat, Pollution & Hub Halts</div>
            </div>
            <Button variant="primary" onClick={() => navigate('/welcome')}>Select Standard</Button>
          </div>

          <div className="glass-1 p-6 rounded-hero space-y-4">
            <span className="text-xs font-bold text-ink/72 uppercase">Premium</span>
            <div className="font-display font-extrabold text-4xl text-ink">₹129 <span className="text-sm font-sans font-bold text-ink/72">/ week</span></div>
            <div className="text-xs font-semibold text-ink/72 space-y-2">
              <div>• ₹500 per disruption</div>
              <div>• Up to 6 payout days / month</div>
              <div>• Complete all-disruption shield</div>
            </div>
            <Button variant="secondary" onClick={() => navigate('/welcome')}>Select Premium</Button>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section id="faq" className="px-6 py-16 bg-sand/20 border-t border-biscuit/40">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="font-display font-extrabold text-3xl text-ink text-center">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={idx} className="glass-1 rounded-card overflow-hidden">
                  <button
                    onClick={() => {
                      haptic('selection');
                      setOpenFaq(isOpen ? null : idx);
                    }}
                    className="w-full p-5 text-left flex items-center justify-between font-display font-bold text-base text-ink"
                  >
                    <span>{item.q}</span>
                    <ChevronDown className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-5 text-xs font-semibold text-ink/72 leading-relaxed border-t border-biscuit/30 pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer & Honesty Notice */}
      <footer className="px-6 py-12 max-w-5xl mx-auto border-t border-biscuit/40 text-center space-y-4">
        <div className="flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded-full bg-walnut flex items-center justify-center text-oat">
            <KavachShield className="w-3.5 h-3.5" />
          </div>
          <span className="font-display font-bold text-base text-ink">Kavach</span>
        </div>
        <p className="text-xs text-ink/48 max-w-xl mx-auto leading-relaxed">
          Kavach is a prototype demonstration built for gig delivery worker protection. Not affiliated with Blinkit, Zepto, or Swiggy Instamart.
        </p>
      </footer>
    </div>
  );
}
