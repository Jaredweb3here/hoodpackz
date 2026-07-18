import Link from "next/link";

interface HoodPackzBrandProps {
  href?: string;
  compact?: boolean;
}

export function HoodPackzBrand({ href = "/", compact = false }: HoodPackzBrandProps) {
  return (
    <Link href={href} className="hp-brand" aria-label="Pakz.fun home">
      <span className="hp-brand-mark" aria-hidden="true">P</span>
      {!compact && <span>PAKZ.FUN</span>}
    </Link>
  );
}
