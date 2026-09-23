import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import Header from "./Header";
import Footer from "./Footer";
import MobileBottomNav from "./MobileBottomNav";

interface PolicyPageLayoutProps {
  title: string;
  effectiveDate?: string;
  children: ReactNode;
}

export const policySectionClassName = "rounded-[24px] border border-border/70 bg-background/80 p-5 md:p-7 shadow-sm";
export const policyHeadingClassName = "text-xl md:text-2xl font-semibold text-foreground mb-3";
export const policyBodyClassName = "text-sm md:text-base leading-7 text-muted-foreground";
export const policyListClassName = "list-disc space-y-2 pl-5 text-sm md:text-base leading-7 text-muted-foreground marker:text-primary/70";
export const policyNoteClassName = "rounded-[22px] border border-primary/20 bg-primary/5 p-5 md:p-6";
export const policyCardClassName = "rounded-[22px] border border-border bg-muted/30 p-5 md:p-6";
export const policyLinkClassName = "text-primary underline-offset-4 hover:underline";

/**
 * Shared shell for the legal / informational pages so they all get the
 * same header, footer, breadcrumb and premium page-header band.
 */
const PolicyPageLayout = ({ title, effectiveDate, children }: PolicyPageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      {/* Premium page header band */}
      <section className="relative bg-gradient-to-br from-[#1a1a1a] via-[#222] to-[#1a1a1a] dark:from-card dark:via-card dark:to-card text-white">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_30%_20%,#d4af37_0%,transparent_55%)]" />
        <div className="container-custom relative py-10 md:py-14">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-white/60 mb-4">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-white transition-colors">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white/90">{title}</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">
            {title}
          </h1>
          {effectiveDate && (
            <p className="mt-2 text-xs md:text-sm text-white/55 tracking-wide">
              {effectiveDate}
            </p>
          )}
          {/* Gold accent underline */}
          <div className="mt-5 h-[2px] w-16 bg-gradient-to-r from-[#d4af37] to-transparent rounded-full" />
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="container-custom max-w-4xl">
          <div className="bg-card/95 text-card-foreground border border-border rounded-[28px] shadow-[0_30px_60px_-45px_rgba(0,0,0,0.45)] p-6 sm:p-8 md:p-12 backdrop-blur-sm">
            <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
              {children}
            </div>
          </div>
        </div>
      </main>

      <Footer />
      <MobileBottomNav />
    </div>
  );
};

export default PolicyPageLayout;
