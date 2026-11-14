import { Link, useParams } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';
import { FarmWizard } from '../components/farms/FarmWizard';
import { useAgroShift } from '../context/AgroShiftContext';
import { Sprout } from 'lucide-react';

export function FarmFormPage() {
  const { id } = useParams<{ id: string }>();
  const { farms } = useAgroShift();

  if (id) {
    const existing = farms.find((f) => f.id === id);
    if (!existing) {
      return (
        <EmptyState
          icon={<Sprout className="w-6 h-6" />}
          title="Farm Profile Not Found"
          description="This farm may have been removed from local browser storage."
          primaryAction={
            <Link
              to="/dashboard/farms"
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#14532D] text-white"
            >
              Return to My Farms
            </Link>
          }
        />
      );
    }
    return <FarmWizard existingFarm={existing} />;
  }

  return <FarmWizard />;
}
