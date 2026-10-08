import Image from "next/image";

/** The company logo with no box around it. Two transparent versions: the original colours, and a brighter one for dark mode. */
export function Logo({ className = "h-11 w-auto", priority }: { className?: string; priority?: boolean }) {
  return (
    <>
      <Image src="/logo-clean.png" alt="JC Roofing" width={512} height={198} priority={priority} className={`logo-light ${className}`} />
      <Image src="/logo-clean-dark.png" alt="JC Roofing" width={512} height={198} aria-hidden loading="lazy" className={`logo-dark ${className}`} />
    </>
  );
}
