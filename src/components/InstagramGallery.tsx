import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, Loader2 } from "lucide-react";
import { subscribeToGalleryImages, GalleryImage } from "@/services/galleryService";
import { SmartImage } from "@/components/ui/smart-image";

const InstagramGallery = () => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToGalleryImages((galleryImages) => {
      setImages(galleryImages);
      setLoading(false);
    }, true); // Only show active images

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <section className="pt-4 pb-8 bg-background">
        <div className="container-custom flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  if (images.length === 0) {
    return null; // Don't show the section if no images
  }

  return (
    <section className="py-8 md:py-12 bg-background">
      <div className="container-custom">
        {/* Section Header */}
        <div className="text-center mb-6 md:mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-foreground font-serif mb-1">
            Gallery
          </h2>
          <p className="text-sm text-muted-foreground font-light">Our finest pieces in one place</p>
        </div>

        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4">
          {images.map((image, index) => (
            <motion.div
              key={image.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="group relative aspect-square rounded-2xl overflow-hidden cursor-pointer"
            >
              <SmartImage
                src={image.imageUrl}
                alt={image.alt}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" preset="card" />
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-primary/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Plus className="w-5 h-5 text-white" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default InstagramGallery;
