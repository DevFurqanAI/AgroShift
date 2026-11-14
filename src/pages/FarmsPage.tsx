import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Check,
  Edit3,
  MapPin,
  Pentagon,
  PlusCircle,
  Sprout,
  Trash2,
} from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { useAgroShift } from '../context/AgroShiftContext';
import { formatArea, formatCoordinate } from '../utils/units';

export function FarmsPage() {
  const { farms, activeFarmId, selectFarm, deleteFarm, settings } = useAgroShift();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  if (farms.length === 0) {
    return (
      <EmptyState
        icon={<Sprout className="w-6 h-6" />}
        title="No Farms Saved Yet"
        description="Add one or more farms worldwide. Each farm keeps its own coordinates, field boundaries, soil observations, crop history, and priorities."
        primaryAction={
          <Link
            to="/dashboard/farms/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] text-white hover:bg-[#166534] transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Add New Farm
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold">Saved Farm Profiles ({farms.length})</h2>
          <p className="text-sm text-[#64748B] dark:text-[#94A3B8]">
            Select a farm as active to inspect its climate data, field health, and rotation planning workspace.
          </p>
        </div>
        <Link
          to="/dashboard/farms/new"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#14532D] hover:bg-[#166534] text-white transition-colors whitespace-nowrap self-start"
        >
          <PlusCircle className="w-4 h-4" />
          Add Farm
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {farms.map((farm) => {
          const isActive = farm.id === activeFarmId;
          const isConfirming = confirmDeleteId === farm.id;
          const locationText =
            [
              farm.location.locality,
              farm.location.region,
              farm.location.country,
            ]
              .filter(Boolean)
              .join(', ') || 'Location coordinates saved';

          return (
            <article
              key={farm.id}
              className={`rounded-xl border p-5 bg-white dark:bg-[#111D18] flex flex-col justify-between gap-4 transition-colors ${
                isActive
                  ? 'border-[#16A34A]'
                  : 'border-[#E2E8F0] dark:border-[#1E2E26]'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#172B22] dark:text-[#E8F1EC]">
                      {farm.details.name}
                    </h3>
                    <p className="text-xs text-[#64748B] dark:text-[#94A3B8] mt-0.5">
                      {locationText}
                    </p>
                  </div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#16A34A] shrink-0">
                      <Check className="w-3.5 h-3.5" />
                      Active
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#E2E8F0] dark:border-[#1E2E26] text-xs">
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Size</span>
                    <p className="font-semibold tabular-nums mt-0.5">
                      {formatArea(farm.details.areaHectares, settings.areaUnit)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Previous Crop</span>
                    <p className="font-semibold mt-0.5">{farm.history.previousCropName}</p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Coordinates</span>
                    <p className="font-mono tabular-nums mt-0.5">
                      {formatCoordinate(farm.location.latitude, 'lat')}
                    </p>
                    <p className="font-mono tabular-nums">
                      {formatCoordinate(farm.location.longitude, 'lon')}
                    </p>
                  </div>
                  <div>
                    <span className="text-[#64748B] dark:text-[#94A3B8]">Geometry</span>
                    <p className="mt-0.5 inline-flex items-center gap-1 font-medium">
                      {farm.location.geometryType === 'polygon' ? (
                        <>
                          <Pentagon className="w-3.5 h-3.5 text-[#16A34A]" />
                          Field Polygon
                        </>
                      ) : (
                        <>
                          <MapPin className="w-3.5 h-3.5 text-[#16A34A]" />
                          Farm Point
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-[#1E2E26] flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => {
                        selectFarm(farm.id);
                        navigate('/dashboard');
                      }}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#14532D] text-white hover:bg-[#166534] transition-colors"
                    >
                      Select Farm
                    </button>
                  )}
                  <Link
                    to={`/dashboard/farms/${farm.id}/edit`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-[#E2E8F0] dark:border-[#1E2E26] hover:border-[#16A34A]"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    Edit
                  </Link>
                </div>

                {isConfirming ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        deleteFarm(farm.id);
                        setConfirmDeleteId(null);
                      }}
                      className="px-2.5 py-1 text-xs font-semibold rounded bg-[#DC2626] text-white"
                    >
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-1 text-xs text-[#64748B]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(farm.id)}
                    aria-label={`Delete ${farm.details.name}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#64748B] hover:text-[#DC2626] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
