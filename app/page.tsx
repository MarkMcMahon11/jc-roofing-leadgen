import QuoteWizard from "@/components/QuoteWizard";
import LegalGate from "@/components/LegalGate";

export default function Home() {
  return (
    <LegalGate>
      <QuoteWizard />
    </LegalGate>
  );
}
