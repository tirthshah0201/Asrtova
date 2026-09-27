"use client";

import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { useApi } from "@/hooks/useApi";
import { Sparkles, Globe, Database, MapPin, Wrench } from "lucide-react";

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

        {/* Under Construction State */}
        <div className="max-w-3xl mx-auto">
          <Card className="overflow-hidden border-cream shadow-lg shadow-terracotta/5">
            <CardContent className="p-8 sm:p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-heritage-gold/10 mx-auto mb-6">
                <Wrench className="h-8 w-8 text-heritage-gold" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl text-charcoal mb-3">
                Astrova AI is Under Construction
              </h2>
              <p className="text-stone text-base sm:text-lg max-w-lg mx-auto mb-6">
                Our multilingual heritage AI assistant is being crafted with care.{' '}
                It will soon help you explore India&apos;s cultural treasures across{' '}
                6 languages.
              </p>
              <div className="flex flex-wrap gap-3 justify-center mb-6">
                <div className="flex items-center gap-2 text-sm text-muted">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  Multilingual AI
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <div className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  Heritage Knowledge
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                  6 Languages
                </div>
              </div>
              <p className="text-xs text-warm-gray">
                In the meantime, explore our{' '}
                <Link href="/explore" className="text-terracotta hover:underline">heritage collection</Link>,{' '}
                <Link href="/timeline" className="text-terracotta hover:underline">timeline</Link>, and{' '}
                <Link href="/collections" className="text-terracotta hover:underline">curated collections</Link>.
              </p>
            </CardContent>
          </Card>
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
