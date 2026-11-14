import { useState } from 'react';
import { Sprout } from 'lucide-react';

interface ResilientImageProps {
  src: string;
  alt: string;
  caption: string;
  className?: string;
}

export function ResilientImage({ src, alt, caption, className = '' }: ResilientImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`w-full h-full flex flex-col items-center justify-center gap-3 p-6 text-center bg-gradient-to-br from-[#14532D] to-[#15803D] text-white ${className}`}
      >
        <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center">
          <Sprout className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm font-medium max-w-xs leading-relaxed text-white/95">
          {caption}
        </p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
