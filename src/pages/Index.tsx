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
      
      {/* Paper texture across the whole page; sections sit on it like cards on a desk. */}
      <main className="tx-paper relative overflow-hidden transition-colors duration-300">

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
