import Image from "next/image";

/** PowerMac Joinery & Construction mark with the product name set like the brand wordmark. */
export function Logo({ compact = false, size = "md" }: { compact?: boolean; size?: "md" | "lg" }) {
  const h = size === "lg" ? 44 : 30;
  return (
    <div className="flex items-center gap-3">
      <Image
        src="/brand/pmj-mark.png"
        alt="PMJ"
        width={346}
        height={128}
        priority
        style={{ height: h, width: "auto" }}
        className="shrink-0 drop-shadow-[0_0_10px_rgb(94_224_0/0.45)]"
      />
      {!compact && (
        <div className="leading-none">
          <div className={`font-display font-bold tracking-[0.04em] ${size === "lg" ? "text-xl" : "text-[15px]"}`}>
            <span className="pm-lime">POWER</span>
            <span className="pm-silver">MAC</span>
          </div>
          <div className={`mt-1 font-medium tracking-[0.32em] text-silver/75 uppercase ${size === "lg" ? "text-[11px]" : "text-[9.5px]"}`}>Connect</div>
        </div>
      )}
    </div>
  );
}
