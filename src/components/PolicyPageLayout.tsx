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

export const policySectionClassName = "rounded-[var(--radius-card)] border border-foreground/[0.08] bg-card/70 p-5 md:p-7";
export const policyHeadingClassName = "text-xl md:text-2xl font-semibold text-foreground mb-3";
export const policyBodyClassName = "text-sm md:text-base leading-7 text-muted-foreground";
export const policyListClassName = "list-disc space-y-2 pl-5 text-sm md:text-base leading-7 text-muted-foreground marker:text-primary/70";
export const policyNoteClassName = "rounded-[var(--radius-card)] border border-primary/20 bg-primary/5 p-5 md:p-6";
export const policyCardClassName = "rounded-[var(--radius-card)] border border-foreground/[0.08] bg-foreground/[0.02] p-5 md:p-6";
export const policyLinkClassName = "text-primary underline-offset-4 hover:underline";

/**
 * Shared shell for the legal / informational pages so they all get the
 * same header, footer, breadcrumb and premium page-header band.
 */
const PolicyPageLayout = ({ title, effectiveDate, children }: PolicyPageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col tx-paper">
      <Header />

      {/* Premium page header band */}
      <section className="tx-slate tx-contour relative overflow-hidden text-white">
        <div className="container-custom relative py-10 md:py-14">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-xs text-white/60 mb-4">
            <Link to="/" className="inline-flex items-center gap-1 hover:text-white transition-colors">
              <Home className="w-3.5 h-3.5" /> Home
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-white/90">{title}</span>
          </nav>
          <h1 className="text-3xl md:text-5xl font-serif font-semibold">
            {title}
          </h1>
          {effectiveDate && (
            <p className="mt-2 text-xs md:text-sm text-white/55 tracking-wide">
              {effectiveDate}
            </p>
          )}
          {/* Gold accent underline */}
          <div className="mt-5 h-[2px] w-16 bg-gradient-to-r from-highlight-soft to-transparent rounded-full" />
        </div>
      </section>

      <main className="flex-1 py-10 md:py-14">
        <div className="container-custom max-w-4xl">
          <div className="panel tx-sheet text-card-foreground p-6 sm:p-8 md:p-12">
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
