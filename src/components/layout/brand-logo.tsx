import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-lg bg-[#FFFDF8] p-2",
        className,
      )}
    >
      <Image
        src="/brand/zerotham-logo.png"
        alt="ZEROTHAM — A Better Way to Grow"
        width={1536}
        height={1024}
        className="h-auto w-full object-contain"
        priority
      />
    </span>
  );
}
