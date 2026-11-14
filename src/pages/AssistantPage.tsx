import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  MessageSquare,
  Send,
  Trash2,
} from 'lucide-react';
import { StatusBanner } from '../components/common/StatusBanner';
import { useAgroShift } from '../context/AgroShiftContext';
import {
  getAssistantStatus,
  sendAssistantMessage,
} from '../services/api/agroshiftApi';
import type { AssistantChatMessage, AssistantStatusResponse } from '../types/api';

const SUGGESTED_QUESTIONS = [
  'Why does rotating legumes after cereal crops help soil health?',
  'What is the difference between NDVI and NDMI field indicators?',
  'Why are NASA POWER historical climate records not the same as future weather forecasts?',
  'What water-conscious rotation considerations apply to my farm profile?',
];

export function AssistantPage() {
  const {
    activeFarm,
    settings,
    latestClimateByFarm,
    latestFieldHealthByFarm,
    latestRotationByFarm,
  } = useAgroShift();

  const [status, setStatus] = useState<AssistantStatusResponse | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [messages, setMessages] = useState<AssistantChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatusLoading(true);
    getAssistantStatus(controller.signal)
      .then((res) => setStatus(res))
      .catch(() => setStatus({ available: false, model: null, provider: 'server-gemini' }))
      .finally(() => setStatusLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const buildFarmContext = () => {
    if (!activeFarm) return null;
    const climate = latestClimateByFarm[activeFarm.id];
    const fieldHealth = latestFieldHealthByFarm[activeFarm.id];
    const rotation = latestRotationByFarm[activeFarm.id];

    return {
      farmName: activeFarm.details.name,
      country: activeFarm.location.country || 'Unresolved',
      region: activeFarm.location.region || 'Unresolved',
      coordinates: {
        latitude: activeFarm.location.latitude,
        longitude: activeFarm.location.longitude,
      },
      areaHectares: activeFarm.details.areaHectares,
      farmType: activeFarm.details.farmType,
      irrigationMethod: activeFarm.details.irrigationMethod,
      waterAvailability: activeFarm.details.waterAvailability,
      rainfallReliability: activeFarm.details.rainfallReliability ?? null,
      soil: activeFarm.soil,
      previousCrop: activeFarm.history.previousCropName,
      orderedCropHistory: activeFarm.history.seasons ?? [],
      priorities: activeFarm.priorities,
      loadedClimateSummary: climate?.data_available
        ? {
            source: climate.source || 'NASA POWER',
            startYear: climate.start_year,
            endYear: climate.end_year,
            monthsCount: climate.monthly?.length ?? 0,
            historicalNotForecast: climate.historical_not_forecast ?? true,
          }
        : 'Not loaded in current session',
      loadedFieldHealth: fieldHealth
        ? {
            satelliteAvailable: fieldHealth.satellite_available,
            ndvi: fieldHealth.ndvi ?? null,
            ndviStatus: fieldHealth.ndvi_status ?? null,
            ndmi: fieldHealth.ndmi ?? null,
            ndmiStatus: fieldHealth.ndmi_status ?? null,
            observationDate: fieldHealth.satellite_observation_date ?? null,
            weatherAvailable: fieldHealth.weather_available,
            temperatureC: fieldHealth.temperature_c ?? null,
            humidityPercent: fieldHealth.humidity_percent ?? null,
            recentRainfallMm: fieldHealth.recent_rainfall_mm ?? null,
            possibleWaterStress: fieldHealth.possible_water_stress ?? null,
          }
        : 'Not loaded in current session',
      loadedRotationScreening: rotation
        ? {
            status: rotation.status,
            topPlans: rotation.plans.slice(0, 3).map((p) => ({
              crops: p.crop_ids,
              score: p.score,
            })),
          }
        : 'Not loaded in current session',
    };
  };

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || sending || !status?.available) return;

    const userMsg: AssistantChatMessage = {
      id: `msg-${Date.now()}-u`,
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setInput('');
    setSending(true);
    setErrorMsg(null);

    try {
      const response = await sendAssistantMessage({
        messages: nextHistory.map((m) => ({ role: m.role, content: m.content })),
        farmContext: buildFarmContext(),
        language: settings.language,
      });

      const assistantMsg: AssistantChatMessage = {
        id: `msg-${Date.now()}-a`,
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Unable to reach Ask AgroShift right now.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend();
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">Ask AgroShift</h2>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8] mt-0.5">
            {activeFarm
              ? `Contextualized for ${activeFarm.details.name}${activeFarm.location.country ? ` (${activeFarm.location.country})` : ''}`
              : 'General farming and Earth observation guidance (select a farm for farm-specific context)'}
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] text-[#64748B] hover:text-[#DC2626] self-start"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Conversation
          </button>
        )}
      </div>

      {!statusLoading && !status?.available && (
        <StatusBanner
          tone="warning"
          title="Ask AgroShift AI Service Is Currently Unavailable"
          description="The server-side AI assistant endpoint is not active in this environment. Other farm management and Earth observation features continue working normally."
        />
      )}

      {/* Conversation Surface */}
      <div className="rounded-xl border border-[#E2E8F0] dark:border-[#1E2E26] bg-white dark:bg-[#111D18] flex flex-col min-h-[460px] max-h-[65vh]">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 ? (
            <div className="space-y-5 py-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-[#16A34A]/10 text-[#14532D] dark:text-[#10B981] flex items-center justify-center shrink-0">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold">
                    Practical guidance grounded in your saved farm data
                  </h3>
                  <p className="text-xs text-[#64748B] dark:text-[#94A3B8] leading-relaxed max-w-xl">
                    Ask AgroShift translates climate records, crop rotation trade-offs, and satellite vegetation indicators into plain language. When live satellite or climate records are not loaded, it clearly notes what is missing rather than inventing measurements.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">
                  Suggested questions
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      disabled={!status?.available || sending}
                      onClick={() => handleSend(q)}
                      className="text-left p-3 rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] text-xs text-[#172B22] dark:text-[#E8F1EC] hover:border-[#16A34A] transition-colors disabled:opacity-50"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#14532D] text-white'
                      : 'bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26] text-[#172B22] dark:text-[#E8F1EC]'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))
          )}

          {sending && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F8FAF7] dark:bg-[#0B1310] border border-[#E2E8F0] dark:border-[#1E2E26] text-xs text-[#64748B]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#16A34A]" />
                Preparing plain-language guidance...
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="flex items-center gap-2 text-xs text-[#DC2626] pt-1">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-[#E2E8F0] dark:border-[#1E2E26] p-3 sm:p-4 flex items-center gap-2.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={!status?.available || sending}
            placeholder={
              status?.available
                ? 'Ask about your farm climate, crop sequence, or NDVI/NDMI...'
                : 'Assistant service is unavailable'
            }
            aria-label="Ask AgroShift a question"
            className="flex-1 px-3.5 py-2.5 text-sm rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] bg-[#F8FAF7] dark:bg-[#0B1310] focus:outline-none focus:ring-2 focus:ring-[#16A34A] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!status?.available || sending || !input.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
