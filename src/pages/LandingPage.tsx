import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Droplets,
  Globe2,
  Layers,
  Menu,
  Sprout,
  SunMedium,
  X,
} from 'lucide-react';
import { LogoMark } from '../components/layout/LogoMark';
import { ResilientImage } from '../components/common/ResilientImage';
import heroFarmlandImg from '../assets/images/hero_agroshift_farmland_1794642288047.jpg';
import earthObservationImg from '../assets/images/earth_observation_crops_1794642287748.jpg';
import globalSmallholderImg from '../assets/images/global_smallholder_field_1794642287829.jpg';

const HOW_IT_WORKS = [
  {
    num: '01',
    title: 'Select your farm',
    body: 'Locate your plot anywhere on Earth using place search, coordinates, or optional field boundary drawing.',
  },
  {
    num: '02',
    title: 'Understand your climate',
    body: 'Review multi-year NASA POWER temperature and rainfall patterns alongside optional local soil observations.',
  },
  {
    num: '03',
    title: 'Compare crop rotations',
    body: 'Explore multi-season crop sequences tailored to your water availability, soil context, and priorities.',
  },
  {
    num: '04',
    title: 'Make informed decisions',
    body: 'Weigh benefits, trade-offs, and data confidence clearly before planting the next season.',
  },
];

const CORE_BENEFITS = [
  {
    title: 'Smarter Crop Rotations',
    body: 'Organize multi-season sequences across cereals, legumes, oilseeds, and cover crops to break pest and disease cycles.',
    icon: Sprout,
    span: 'md:col-span-2',
  },
  {
    title: 'Water-Conscious Planning',
    body: 'Account for rain-fed limits, seasonal irrigation windows, and moisture stress before committing seed.',
    icon: Droplets,
    span: 'md:col-span-1',
  },
  {
    title: 'Soil Health Awareness',
    body: 'Keep farmer-observed soil texture, drainage, and lab pH separate from estimates so nothing is hidden.',
    icon: Layers,
    span: 'md:col-span-1',
  },
  {
    title: 'Climate Adaptation',
    body: 'Ground field decisions in multi-decade NASA POWER historical baselines rather than guesswork.',
    icon: SunMedium,
    span: 'md:col-span-2',
  },
  {
    title: 'Global Accessibility',
    body: 'Built for smallholders, rain-fed valleys, and commercial operators across hemispheres, seasons, and area units.',
    icon: Globe2,
    span: 'md:col-span-1',
  },
  {
    title: 'Understandable Guidance',
    body: 'Plain-language explanations with clear uncertainty notes instead of opaque technical jargon.',
    icon: Compass,
    span: 'md:col-span-2',
  },
];

export function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#F8FAF7] text-[#172B22] dark:bg-[#0B1310] dark:text-[#E8F1EC]">
      {/* Top Bar Contract: [Wordmark] — [4-5 links] — [1 primary CTA] */}
      <header className="sticky top-0 z-40 border-b border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7]/95 dark:bg-[#0B1310]/95 backdrop-blur-sm">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#14532D] dark:text-[#E8F1EC] whitespace-nowrap shrink-0"
          >
            <LogoMark className="w-7 h-7 shrink-0" />
            <span>AgroShift</span>
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--as-text-muted)]"
          >
            <a
              href="#top"
              className="hover:text-[#14532D] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Home
            </a>
            <a
              href="#how-it-works"
              className="hover:text-[#14532D] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              How It Works
            </a>
            <a
              href="#features"
              className="hover:text-[#14532D] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Explore Features
            </a>
            <a
              href="#earth-data"
              className="hover:text-[#14532D] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              About
            </a>
            <Link
              to="/dashboard"
              className="hover:text-[#14532D] dark:hover:text-white transition-colors whitespace-nowrap shrink-0"
            >
              Dashboard
            </Link>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/dashboard/farms/new"
              className="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap shrink-0"
            >
              Get Started
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="md:hidden p-2 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26]"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] px-4 py-4 space-y-2">
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              How It Works
            </a>
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              Explore Features
            </a>
            <a
              href="#earth-data"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              About
            </a>
            <Link
              to="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="block py-2 text-sm font-medium"
            >
              Dashboard
            </Link>
            <Link
              to="/dashboard/farms/new"
              onClick={() => setMobileMenuOpen(false)}
              className="mt-2 block w-full text-center px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] text-white"
            >
              Plan My Farm
            </Link>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <main id="top">
        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-10 pb-16 lg:pt-16 lg:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <p className="text-xs font-semibold as-text-accent">
                AgroShift · Every Farm Deserves Smarter Decisions
              </p>
              <h1 className="font-display text-[clamp(2.25rem,4vw,3.5rem)] font-bold leading-[1.08] tracking-tight text-[#172B22] dark:text-[#E8F1EC] text-balance">
                Smarter Farming Starts with Better Decisions.
              </h1>
              <p className="text-base sm:text-lg text-[var(--as-text-muted)] leading-relaxed max-w-[60ch]">
                Explore climate-smart crop rotations using Earth observation data, local farm conditions, and easy-to-understand agricultural insights.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to="/dashboard/farms/new"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg as-btn-primary transition-colors whitespace-nowrap"
                >
                  Plan My Farm
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] text-[#172B22] dark:text-[#E8F1EC] hover:border-[var(--as-accent-text)] transition-colors whitespace-nowrap"
                >
                  Explore AgroShift
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-[#D9E2EC] dark:border-[#23362D] bg-[#14532D] relative">
                <ResilientImage
                  src={heroFarmlandImg}
                  alt="Aerial view of sustainable crop rotation strips with green legumes and golden grain fields"
                  caption="Multi-crop rotation strips supporting climate-smart farm planning"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* A. How AgroShift Works */}
        <section
          id="how-it-works"
          className="border-t border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] py-16 lg:py-20"
        >
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold as-text-accent">How AgroShift Works</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                Four practical steps from field location to seasonal planning
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {HOW_IT_WORKS.map((item) => (
                <div
                  key={item.num}
                  className="rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-[#F8FAF7] dark:bg-[#0B1310] p-6 space-y-3"
                >
                  <span className="font-mono tabular-nums text-sm font-semibold as-text-accent">
                    {item.num}.
                  </span>
                  <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                    {item.title}
                  </h3>
                  <p className="text-sm text-[var(--as-text-muted)] leading-relaxed">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* B. Core Benefits */}
        <section id="features" className="py-16 lg:py-20">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
            <div className="max-w-2xl space-y-2">
              <p className="text-xs font-semibold as-text-accent">Core Benefits</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                Designed for everyday farm decisions, not academic complexity
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {CORE_BENEFITS.map(({ title, body, icon: Icon, span }) => (
                <div
                  key={title}
                  className={`${span} rounded-xl border border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] p-6 space-y-3`}
                >
                  <div className="w-10 h-10 rounded-lg as-icon-badge flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                    {title}
                  </h3>
                  <p className="text-sm text-[var(--as-text-muted)] leading-relaxed max-w-xl">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* C. Global Reach */}
        <section className="border-t border-[#D9E2EC] dark:border-[#23362D] bg-white dark:bg-[#111D18] py-16 lg:py-20">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6">
              <div className="aspect-[4/3] rounded-2xl overflow-hidden border border-[#D9E2EC] dark:border-[#23362D] bg-[#14532D]/10">
                <ResilientImage
                  src={globalSmallholderImg}
                  alt="Terraced green smallholder agricultural plots across rolling hillside terrain"
                  caption="Global climate-smart support for smallholder and commercial fields"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
            <div className="lg:col-span-6 space-y-5">
              <p className="text-xs font-semibold as-text-accent">Global Reach</p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                Built for every climate zone, cropping calendar, and farm scale
              </h2>
              <p className="text-sm sm:text-base text-[var(--as-text-muted)] leading-relaxed">
                Whether you manage a half-hectare rain-fed plot in East Africa, terraced grains in South Asia, or multi-field commercial acreage in the Americas or Europe, AgroShift adapts to your exact coordinates, area units, water constraints, and crop history.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#D9E2EC] dark:border-[#23362D]">
                <div>
                  <p className="text-sm font-semibold">Smallholders & Rain-Fed</p>
                  <p className="text-xs text-[var(--as-text-muted)] mt-1">
                    No laboratory soil tests required to get started.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Irrigated & Commercial</p>
                  <p className="text-xs text-[var(--as-text-muted)] mt-1">
                    Boundary polygons, acres or hectares, and multi-farm switching.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold">Global Crop Catalog</p>
                  <p className="text-xs text-[var(--as-text-muted)] mt-1">
                    Cereals, legumes, tubers, oilseeds, and cover crops.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* D. Earth Observation Intelligence */}
        <section id="earth-data" className="py-16 lg:py-20">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-5 order-2 lg:order-1">
              <p className="text-xs font-semibold as-text-accent">
                Earth Observation Intelligence
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance">
                Transparent separation of climate records and satellite vegetation indicators
              </h2>
              <div className="space-y-4 text-sm text-[var(--as-text-muted)] leading-relaxed">
                <p>
                  <strong className="text-[#172B22] dark:text-[#E8F1EC]">
                    NASA POWER Historical Climate:
                  </strong>{' '}
                  Provides multi-year historical surface temperature and precipitation observations for your farm coordinates—helping you inspect seasonal rhythms and dry/wet variability without confusing past records with future forecasts.
                </p>
                <p>
                  <strong className="text-[#172B22] dark:text-[#E8F1EC]">
                    ESA / Copernicus Sentinel-2 Indicators:
                  </strong>{' '}
                  When connected to the field-analysis service, AgroShift displays NDVI and NDMI vegetation and moisture indicators alongside local weather context—clearly labeled as field indicators rather than lab soil diagnoses.
                </p>
              </div>
              <div className="pt-2">
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 text-sm font-semibold as-text-accent hover:underline"
                >
                  Open Farmer Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6 order-1 lg:order-2">
              <div className="aspect-[16/10] rounded-2xl overflow-hidden border border-[#D9E2EC] dark:border-[#23362D] bg-[#14532D]/10">
                <ResilientImage
                  src={earthObservationImg}
                  alt="Overhead view of structured multi-crop plots and moisture-conserving contours"
                  caption="Earth observation climate baselines and satellite canopy indicators"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>

        {/* E. Call to Action */}
        <section className="border-t border-[#D9E2EC] dark:border-[#23362D] bg-[#14532D] text-white py-16">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-balance text-white">
                Plan a Better Future for Your Farm.
              </h2>
              <p className="text-sm sm:text-base text-white/90">
                Set up your first field location in minutes and connect your climate, soil, and crop rotation workflow.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <Link
                to="/dashboard/farms/new"
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold rounded-lg bg-white text-[#14532D] hover:bg-[#F8FAF7] transition-colors whitespace-nowrap"
              >
                Plan My Farm
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold rounded-lg border border-white/40 text-white hover:bg-white/10 transition-colors whitespace-nowrap"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* F. Professional Footer */}
      <footer className="border-t border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] py-10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center justify-between gap-6 text-xs text-[#64748B] dark:text-[#94A3B8]">
          <div className="space-y-1.5">
            <p className="font-display text-sm font-bold text-[#14532D] dark:text-[#E8F1EC]">
              AgroShift · Every Farm Deserves Smarter Decisions.
            </p>
            <p>
              Built for NASA Space Apps Challenge 2026 — Challenge: Field Shift: Adapting Farms with NASA Data.
            </p>
            <p>
              Independent open agricultural decision-support project. Not officially endorsed by NASA or ESA/Copernicus.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-5 text-sm font-medium">
            <Link to="/dashboard" className="hover:text-[#14532D] dark:hover:text-white">
              Dashboard
            </Link>
            <Link to="/dashboard/farms/new" className="hover:text-[#14532D] dark:hover:text-white">
              Add Farm
            </Link>
            <Link to="/dashboard/climate" className="hover:text-[#14532D] dark:hover:text-white">
              Climate Intelligence
            </Link>
            <Link to="/dashboard/settings" className="hover:text-[#14532D] dark:hover:text-white">
              Settings
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
