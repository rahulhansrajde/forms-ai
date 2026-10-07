import { useMemo } from 'react';
import { encode } from 'uqr';

const QUIET_ZONE_MODULES = 4;

interface QrCodeProps {
  value: string;
  label: string;
  className?: string;
}

export function QrCode({ value, label, className }: QrCodeProps) {
  const { size, path } = useMemo(() => {
    const matrix = encode(value, { ecc: 'M', border: QUIET_ZONE_MODULES });
    const segments: string[] = [];
    matrix.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) {
          segments.push(`M${x} ${y}h1v1h-1z`);
        }
      });
    });
    return { size: matrix.size, path: segments.join('') };
  }, [value]);

  return (
    <svg className={className} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width={size} height={size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
