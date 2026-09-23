import { useRef, useState } from "react";
import { motion, useInView } from "framer-motion";
import { Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const NewsletterForm = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreed) {
      toast({ title: "Please agree to the Privacy Policy", variant: "destructive" });
      return;
    }
    toast({ title: "Thank you for subscribing!", description: "You'll receive our latest updates." });
    setEmail("");
    setAgreed(false);
  };

  return (
    <section ref={ref} className="py-12 md:py-16 pb-4 bg-secondary/50">
      <div className="container-custom">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="max-w-2xl mx-auto text-center"
        >
          <h2 className="text-3xl md:text-4xl font-semibold mb-4 text-foreground" style={{ fontFamily: "'Montserrat', sans-serif" }}>Subscribe to Our Newsletter</h2>
          <p className="body-lg mb-8">
            Sign up to our newsletter for information on sales, delightful content and new additions.
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email..."
                required
                className="flex-1 px-5 py-4 rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button type="submit" className="btn-primary whitespace-nowrap">
                Subscribe
              </button>
            </div>
            <label className="flex items-center justify-center gap-2 cursor-pointer">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  agreed ? "bg-primary border-primary" : "border-muted-foreground"
                }`}
                onClick={() => setAgreed(!agreed)}
              >
                {agreed && <Check className="w-3 h-3 text-primary-foreground" />}
              </div>
              <span className="text-sm text-muted-foreground">I agree to the Privacy Policy.</span>
            </label>
          </form>
        </motion.div>
      </div>
    </section>
  );
};

export default NewsletterForm;
