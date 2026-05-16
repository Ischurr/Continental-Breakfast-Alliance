'use client';

import { useState } from 'react';
import Image from 'next/image';

interface Props {
  src: string;
  alt: string;
  initial: string;
  primaryColor?: string;
  className?: string;
}

/** Team logo with automatic fallback to an initials circle if the image 404s. */
export default function TeamLogoImage({ src, alt, initial, primaryColor, className }: Props) {
  const [failed, setFailed] = useState(false);

  const shared = className ?? 'w-14 h-14 min-w-[56px] rounded-full flex-shrink-0 self-center border-2 border-gray-200 shadow-sm';

  if (failed) {
    return (
      <div
        className={`${shared} flex items-center justify-center text-white font-bold text-lg`}
        style={{ backgroundColor: primaryColor ?? '#6b7280' }}
      >
        {initial}
      </div>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={56}
      height={56}
      className={`${shared} object-cover bg-white`}
      unoptimized
      onError={() => setFailed(true)}
    />
  );
}
