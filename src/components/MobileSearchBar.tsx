import { Search, Gift } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

const MobileSearchBar = () => {
  const navigate = useNavigate();
  
  const categories = [
    "silver jewellery",
    "rings",
    "necklaces",
    "earrings",
    "bracelets",
    "pendants",
    "chains",
    "anklets",
    "silver coins",
    "gift articles"
  ];
  
  const [currentIndex, setCurrentIndex] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % categories.length);
    }, 2500);
    
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="lg:hidden bg-background px-4 pt-1 pb-2 z-40">
      <div className="w-full relative flex items-center bg-muted rounded-full overflow-hidden h-[46px]">
        {/* Search Icon + Placeholder — takes remaining space, shrinks if needed */}
        <button 
          onClick={() => navigate("/search")}
          className="pl-4 pr-2 flex items-center h-full flex-1 min-w-0"
        >
          <Search className="w-[20px] h-[20px] text-foreground/80 flex-shrink-0" strokeWidth={1} />
        
          {/* Placeholder Text */}
          <div className="flex-1 min-w-0 text-[13px] text-muted-foreground text-left flex items-center overflow-hidden ml-2">
            <span className="mr-1 whitespace-nowrap flex-shrink-0">Search for</span>
            <div className="relative min-w-0 w-[90px] h-[20px] overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.span
                  key={currentIndex}
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="absolute left-0 top-0 whitespace-nowrap"
                >
                  {categories[currentIndex]}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>
        </button>
        
        {/* Voice search lives only on the mobile /search page. */}
        <div className="flex items-center gap-0 pr-2.5 flex-shrink-0">
          <button 
            onClick={(e) => { e.stopPropagation(); navigate('/category/articles?sub=gifting'); }}
            className="p-1.5 hover:bg-background/60 rounded-full transition-colors" 
            aria-label="Gift articles"
          >
            <Gift className="w-[20px] h-[20px] text-foreground/80" strokeWidth={1} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MobileSearchBar;
