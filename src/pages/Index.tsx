import { lazy, Suspense, type ReactNode } from "react";
import Header from "@/components/Header";
import MobileBottomNav from "@/components/MobileBottomNav";
import MobileSearchBar from "@/components/MobileSearchBar";
import CategoryIconNav from "@/components/CategoryIconNav";
import HeroBanner from "@/components/HeroBanner";
import TopDeals from "@/components/TopDeals";
import BestSellers from "@/components/BestSellers";
import FeaturedSection from "@/components/FeaturedSection";
import TrendProducts from "@/components/TrendProducts";
import TrendProductSection from "@/components/TrendProductSection";
import Footer from "@/components/Footer";
import { LazyMount } from "@/components/ui/lazy-mount";

// Below the fold: each section is its own chunk, fetched only as it nears the screen.
const MarqueeBand = lazy(() => import("@/components/MarqueeBand"));
const CategoryShowcase = lazy(() => import("@/components/CategoryShowcase"));
const FeatureIcons = lazy(() => import("@/components/FeatureIcons"));
const PromoSection = lazy(() => import("@/components/PromoSection"));
const FreeShippingBand = lazy(() => import("@/components/FreeShippingBand"));
const TestimonialsCarousel = lazy(() => import("@/components/TestimonialsCarousel"));
const CollectionBanner = lazy(() => import("@/components/CollectionBanner"));
const YouTubeShowcase = lazy(() => import("@/components/YouTubeShowcase"));

/**
 * Mounts a lazy section shortly before it scrolls into view. The placeholder
 * holds the section's usual height (per breakpoint) so nothing jumps when it
 * arrives.
 */
const Deferred = ({ children, reserve }: { children: ReactNode; reserve: string }) => {
  const placeholder = <div aria-hidden="true" className={reserve} />;
  return (
    <LazyMount rootMargin="600px 0px" placeholder={placeholder}>
      <Suspense fallback={placeholder}>{children}</Suspense>
    </LazyMount>
  );
};

const Index = () => {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-background">
      <Header />

      {/* Mobile Search Bar - Sticky */}
      <MobileSearchBar />

      {/* Category Navigation */}
      <CategoryIconNav />

      {/* Paper texture across the whole page; sections sit on it like cards on a desk. */}
      <main id="main" tabIndex={-1} className="tx-paper relative overflow-hidden outline-none">
        <div className="relative z-raised">
          <HeroBanner />
          <TopDeals />
          <BestSellers />
          <FeaturedSection />
          <TrendProducts />
          <TrendProductSection />
          <Deferred reserve="h-[50px] md:h-[70px]">
            <MarqueeBand />
          </Deferred>
          <Deferred reserve="h-[1047px] md:h-[705px]">
            <CategoryShowcase />
          </Deferred>
          <Deferred reserve="h-0 md:h-[503px] lg:h-[464px] xl:h-[449px]">
            <FeatureIcons />
          </Deferred>
          <Deferred reserve="h-[552px] md:h-[840px] lg:h-[893px]">
            <PromoSection />
          </Deferred>
          <Deferred reserve="h-0 md:h-[47px]">
            <FreeShippingBand />
          </Deferred>
          <Deferred reserve="h-[925px] md:h-[985px] lg:h-[677px] xl:h-[631px]">
            <TestimonialsCarousel />
          </Deferred>
          <Deferred reserve="h-[364px] md:h-[516px]">
            <CollectionBanner />
          </Deferred>
          <Deferred reserve="h-0">
            <YouTubeShowcase />
          </Deferred>
        </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default Index;
