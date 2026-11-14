import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { useAgroShift } from '../context/AgroShiftContext';
import { SUPPORTED_LANGUAGES } from '../i18n/languages';
import type { AreaUnit, SupportedLanguageCode, TemperatureUnit } from '../types/farm';

export function SettingsPage() {
  const { settings, updateSettings, clearLocalData } = useAgroShift();

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-display text-xl font-bold">Preferences & Device Data</h2>
        <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-1">
          Choose your measurement units, display theme, language, and manage farms saved on this device.
        </p>
      </div>

      {/* Units & Theme */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-5">
        <h3 className="text-base font-semibold">Measurement Units & Appearance</h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="pref-area" className="block text-xs font-semibold mb-1.5">
              Area Unit
            </label>
            <select
              id="pref-area"
              value={settings.areaUnit}
              onChange={(e) => updateSettings({ areaUnit: e.target.value as AreaUnit })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]"
            >
              <option value="hectares">Hectares (ha)</option>
              <option value="acres">Acres (ac)</option>
            </select>
          </div>

          <div>
            <label htmlFor="pref-temp" className="block text-xs font-semibold mb-1.5">
              Temperature Unit
            </label>
            <select
              id="pref-temp"
              value={settings.temperatureUnit}
              onChange={(e) =>
                updateSettings({ temperatureUnit: e.target.value as TemperatureUnit })
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]"
            >
              <option value="celsius">Celsius (°C)</option>
              <option value="fahrenheit">Fahrenheit (°F)</option>
            </select>
          </div>

          <div>
            <label htmlFor="pref-theme" className="block text-xs font-semibold mb-1.5">
              Theme
            </label>
            <select
              id="pref-theme"
              value={settings.theme}
              onChange={(e) =>
                updateSettings({ theme: e.target.value as 'light' | 'dark' })
              }
              className="w-full px-3 py-2 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310]"
            >
              <option value="light">Light (Warm White)</option>
              <option value="dark">Dark (Forest Slate)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Internationalization */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold">Interface Language</h3>
          <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            English is currently complete. Additional regional languages and right-to-left (RTL) layouts are prepared in the localization registry and marked honestly until translations are completed.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const selected = settings.language === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                disabled={!lang.available}
                onClick={() =>
                  updateSettings({ language: lang.code as SupportedLanguageCode })
                }
                className={`text-left p-3 rounded-lg border flex items-center justify-between gap-2 transition-colors ${
                  selected
                    ? 'border-[#16A34A] bg-[#16A34A]/5'
                    : lang.available
                      ? 'border-[#E2E8F0] dark:border-[#1E2E26] hover:border-[#16A34A]'
                      : 'border-[#E2E8F0] dark:border-[#1E2E26] opacity-60 cursor-not-allowed'
                }`}
              >
                <div>
                  <p className="text-sm font-semibold">
                    {lang.name} ({lang.nativeName})
                  </p>
                  <p className="text-[11px] text-[#64748B] dark:text-[#94A3B8]">
                    {lang.note}
                  </p>
                </div>
                {selected && <Check className="w-4 h-4 text-[#16A34A] shrink-0" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Local Browser Persistence */}
      <section className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] p-5 sm:p-6 space-y-3">
        <h3 className="text-base font-semibold">Saved Farm Data on This Device</h3>
        <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed">
          Your farm profiles and saved plans are stored locally in this browser without requiring an account. Clearing browser data or clicking below will remove saved farms from this device.
        </p>

        {!confirmReset ? (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border border-[#DC2626]/40 text-[#DC2626] hover:bg-[#DC2626]/5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All Local Farm Data
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                clearLocalData();
                setConfirmReset(false);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#DC2626] text-white"
            >
              Confirm Clear All
            </button>
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="px-3 py-2 text-xs text-[#64748B]"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
