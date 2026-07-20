import Link from "next/link";
import Image from "next/image";

interface HoodPackzBrandProps {
  href?: string;
  compact?: boolean;
}

export function HoodPackzBrand({ href = "/", compact = false }: HoodPackzBrandProps) {
  return (
    <Link href={href} className="hp-brand" aria-label="Paxz home">
      <span className="hp-brand-mark" aria-hidden="true">
        <Image src="/lopa.png" alt="" width={38} height={38} priority />
      </span>
      {!compact && <span>PAXZ</span>}
    </Link>
  );
}
