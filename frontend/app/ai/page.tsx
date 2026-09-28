"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Badge } from "@/components/ui/Badge";
import { useApi } from "@/hooks/useApi";
import { ChatBot } from "@/components/ai/ChatBot";
import { Sparkles, Globe, Database, MapPin, ShieldCheck } from "lucide-react";

function AIPageContent() {
  const { data: heritage } = useApi<Array<{ id: string }>>("/heritage");
  // Live count only — show a placeholder instead of a stale number while loading.
  const heritageCount = heritage?.length;

  return (
    <div className="py-8 sm:py-12">
      <Container>
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100 mx-auto mb-4">
            <Sparkles className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-charcoal">
            Astrova Guide
          </h1>
          <p className="mt-3 text-stone text-lg">
            Ask about India&apos;s heritage across 12 states in 6 languages.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-3">
            <Badge variant="default" className="bg-red-600 text-white">
              <Globe className="h-3 w-3 mr-1" /> 6 Languages
            </Badge>
            <Badge variant="secondary" className="bg-terracotta-mist text-stone border-cream">
              <Database className="h-3 w-3 mr-1" /> {heritageCount ?? "—"} Heritage Records
            </Badge>
            <Badge variant="outline" className="border-cream text-stone">
              <MapPin className="h-3 w-3 mr-1" /> 12 States
            </Badge>
          </div>
        </div>

        {/* Live RAG chat (Phase 37 — backend verified end-to-end) */}
        <div className="max-w-3xl mx-auto">
          <ChatBot />
          <p className="mt-3 text-center text-xs text-warm-gray">
            Answers are retrieved from Astrova&apos;s knowledge base with cited sources. 
            When nothing trustworthy is found, the assistant says so instead of guessing. 
            See our <Link href="/about" className="text-terracotta hover:underline">data sources</Link>.
          </p>
        </div>

        {/* RAG status badges */}
        <div className="mt-8 flex flex-wrap justify-center gap-2">
          <Badge variant="secondary" className="bg-terracotta-mist text-stone border-cream">
            <ShieldCheck className="h-3 w-3 mr-1" /> Source-cited answers
          </Badge>
          <Badge variant="secondary" className="bg-terracotta-mist text-stone border-cream">
            <Globe className="h-3 w-3 mr-1" /> 6 Languages
          </Badge>
          <Badge variant="outline" className="border-cream text-stone">
            No answer? INFORMATION UNAVAILABLE
          </Badge>
        </div>

        {/* Supported States */}
        <div className="mt-10 text-center">
          <h3 className="text-sm font-medium text-stone mb-3">
            Supported States
          </h3>
          <div className="flex flex-wrap gap-2 justify-center">
            {["Gujarat", "Rajasthan", "Punjab", "Goa", "Tamil Nadu", "Maharashtra", "Madhya Pradesh", "Delhi", "Kerala", "Jammu & Kashmir", "Assam", "Odisha"].map(
              (state) => (
                <Badge key={state} variant="outline" className="border-cream text-stone">
                  {state}
                </Badge>
              )
            )}
          </div>
        </div>
      </Container>
    </div>
  );
}

export default function AIPage() {
  return <AIPageContent />;
}
