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

/** Sections sit in one panel, separated by hairlines (no card per section). */
export const policySectionClassName = "border-t border-foreground/[0.08] pt-7 first:border-t-0 first:pt-0";
export const policyHeadingClassName = "mb-3 font-heading text-lg font-semibold tracking-tight text-foreground [text-wrap:balance] md:text-2xl";
export const policyBodyClassName = "max-w-[68ch] text-[15px] leading-relaxed text-muted-foreground [text-wrap:pretty] md:text-base";
export const policyListClassName = "max-w-[68ch] list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground marker:text-primary md:text-base";
/** The one tinted box a policy page may use. */
export const policyNoteClassName = "max-w-[68ch] rounded-card border border-primary/20 bg-primary/[0.06] p-4 md:p-5";
/** Contact details block: plain rows, no box (the panel already groups them). */
export const policyCardClassName = "space-y-1";
export const policyLinkClassName = "text-primary underline-offset-4 hover:underline";

/**
 * Shared shell for the legal and information pages: header, a charcoal title
 * band with a real breadcrumb, then one paper panel holding the sections.
 */
const PolicyPageLayout = ({ title, effectiveDate, children }: PolicyPageLayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col tx-paper">
      <Header />

      <main id="main" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {/* Title band */}
        <section className="tx-slate tx-contour relative overflow-hidden text-charcoal-foreground">
          <div className="container-custom relative py-10 md:py-14">
            <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-xs text-charcoal-foreground/70">
              <Link
                to="/"
                className="inline-flex min-h-6 items-center gap-1 transition-colors duration-hover hover:text-charcoal-foreground"
              >
                <Home aria-hidden="true" className="size-3.5" /> Home
              </Link>
              <ChevronRight aria-hidden="true" className="size-3.5" />
              <span aria-current="page" className="text-charcoal-foreground/90">{title}</span>
            </nav>
            <h1 className="font-heading text-3xl font-semibold tracking-tight [text-wrap:balance] md:text-5xl">
              {title}
            </h1>
            {effectiveDate && (
              <p className="mt-3 text-xs text-charcoal-foreground/70 md:text-sm">
                {effectiveDate}
              </p>
            )}
            <div aria-hidden="true" className="mt-5 h-0.5 w-16 bg-gradient-to-r from-highlight-soft to-transparent" />
          </div>
        </section>

        <div className="flex-1 py-8 md:py-14">
          <div className="container-custom max-w-4xl">
            <div className="panel tx-sheet p-5 text-card-foreground sm:p-8 md:p-12">
              <div className="space-y-7">
                {children}
              </div>
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
