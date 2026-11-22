import { ShieldCheck, Loader, Info, Clock, Eye, XCircle } from 'lucide-react';

const statusConfig = {
  success: { bg: 'bg-sage/20 text-walnut', icon: ShieldCheck },
  'in-progress': { bg: 'bg-sky/20 text-walnut', icon: Loader },
  info: { bg: 'bg-powder/30 text-walnut', icon: Info },
  attention: { bg: 'bg-honey/20 text-walnut', icon: Clock },
  watching: { bg: 'bg-honey/20 text-walnut', icon: Eye },
  problem: { bg: 'bg-madder/20 text-walnut', icon: XCircle },
};

export default function StatusPill({ status = 'info', label, className = '' }) {
  const config = statusConfig[status] || statusConfig.info;
  const IconComp = config.icon;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        h-8 px-3
        rounded-full
        text-sm font-bold
        ${config.bg}
        ${className}
      `}
    >
      <IconComp className={`h-4 w-4 ${status === 'in-progress' ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}
