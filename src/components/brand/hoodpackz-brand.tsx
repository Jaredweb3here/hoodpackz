import Link from "next/link";
import Image from "next/image";

interface HoodPackzBrandProps {
  href?: string;
  compact?: boolean;
}

export function HoodPackzBrand({ href = "/", compact = false }: HoodPackzBrandProps) {
  return (
    <Link href={href} className="hp-brand" aria-label="HoodPackz home">
      <span className="hp-brand-mark" aria-hidden="true">
        <Image src="/hoodpackz-logo.png" alt="" width={34} height={34} priority />
      </span>
      {!compact && <span>HOODPACKZ</span>}
    </Link>
  );
}
