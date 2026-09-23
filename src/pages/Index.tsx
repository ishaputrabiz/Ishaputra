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
import MarqueeBand from "@/components/MarqueeBand";
import CategoryShowcase from "@/components/CategoryShowcase";
import FeatureIcons from "@/components/FeatureIcons";
import PromoSection from "@/components/PromoSection";
import FreeShippingBand from "@/components/FreeShippingBand";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import CollectionBanner from "@/components/CollectionBanner";
import YouTubeShowcase from "@/components/YouTubeShowcase";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen w-full overflow-x-clip bg-background">
      <Header />
      
      {/* Mobile Search Bar - Sticky */}
      <MobileSearchBar />
      
      {/* Category Navigation */}
      <CategoryIconNav />
      
      <main className="relative overflow-hidden bg-[linear-gradient(180deg,#fffdf9_0%,#fff7eb_18%,#fffdfa_44%,#fff7ec_74%,#ffffff_100%)] transition-colors duration-300 dark:bg-[linear-gradient(180deg,#090909_0%,#111111_18%,#14110f_44%,#1a130d_74%,#0b0b0b_100%)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-0 h-[44rem] bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.16),transparent_36%),radial-gradient(circle_at_top_left,rgba(131,39,41,0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(212,175,55,0.14),transparent_34%),radial-gradient(circle_at_top_left,rgba(131,39,41,0.18),transparent_30%)]" />
        <div className="pointer-events-none absolute left-1/2 top-[38rem] z-0 h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,223,181,0.24)_0%,rgba(255,255,255,0)_72%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(212,175,55,0.16)_0%,rgba(8,8,8,0)_72%)]" />

        <div className="relative z-10">
          <HeroBanner />
          <TopDeals />
          <BestSellers />
          <FeaturedSection />
          <TrendProducts />
          <TrendProductSection />
          <MarqueeBand />
          <CategoryShowcase />
          <FeatureIcons />
          <PromoSection />
          <FreeShippingBand />
          <TestimonialsCarousel />
          <CollectionBanner />
          <YouTubeShowcase />
        </div>
      </main>
      
      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default Index;
