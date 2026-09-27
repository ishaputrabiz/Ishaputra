import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BRAND } from "@/config/brand";
import { SITE_HOST } from "@/lib/siteUrl";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission
    console.log("Form submitted:", formData);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      <Header />
      <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative h-[350px] flex items-center justify-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: "url('https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1600/v1790164427/ishaputrabotanicals/demo/zurdxwuvf6utvs9nj4fb.jpg')",
            filter: "blur(2px)",
          }}
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 text-center text-white">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-5xl md:text-6xl font-light tracking-wide mb-4"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Contact
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-lg tracking-wider"
          >
            HOME PAGE &gt; CONTACT
          </motion.p>
        </div>
      </div>

      {/* Get In Touch Section */}
      <div className="container-custom py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2
            className="text-4xl md:text-5xl font-light text-foreground mb-6"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Get In Touch
          </h2>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            Questions about a product, your order or which ritual suits you? Write to us - a real person
            reads every message and replies within a day.
          </p>
        </motion.div>

        {/* Contact Info Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {/* Address */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-left"
          >
            <div className="flex items-start gap-4 mb-4">
              <MapPin className="w-6 h-6 text-foreground mt-1" />
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Address:
              </h3>
            </div>
            <div className="ml-10">
              {BRAND.addressLines.length > 0 ? (
                BRAND.addressLines.map((line) => (
                  <p key={line} className="text-muted-foreground mb-1">{line}</p>
                ))
              ) : (
                <p className="text-muted-foreground">Online store - shipping across India</p>
              )}
            </div>
          </motion.div>

          {/* Contact Us */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-left"
          >
            <div className="flex items-start gap-4 mb-4">
              <Phone className="w-6 h-6 text-foreground mt-1" />
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Contact Us
              </h3>
            </div>
            <div className="ml-10">
              {BRAND.phones[0] && <p className="text-muted-foreground mb-1">Mobile: {BRAND.phones[0]}</p>}
              <p className="text-muted-foreground mb-1">Website: {SITE_HOST}</p>
              {BRAND.email && <p className="text-muted-foreground">Mail: {BRAND.email}</p>}
            </div>
          </motion.div>

          {/* Hour Of Operation */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-left"
          >
            <div className="flex items-start gap-4 mb-4">
              <Clock className="w-6 h-6 text-foreground mt-1" />
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "var(--font-body)" }}>
                Hour Of Operation
              </h3>
            </div>
            <div className="ml-10">
              <p className="text-muted-foreground mb-1">{BRAND.hours}</p>
              <p className="text-muted-foreground">Online orders: 24 × 7</p>
            </div>
          </motion.div>
        </div>

        {/* Contact Form and Map Section - Side by Side */}
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-light text-foreground text-center mb-12"
            style={{ fontFamily: "var(--font-body)" }}
          >
            Send a Message
          </h2>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6">
                  <Input
                    type="text"
                    name="name"
                    placeholder="Name"
                    value={formData.name}
                    onChange={handleChange}
                    className="h-14 px-6 text-base bg-muted/30 border-border rounded-xl focus:ring-2 focus:ring-primary/20"
                    required
                  />
                  <Input
                    type="email"
                    name="email"
                    placeholder="Email"
                    value={formData.email}
                    onChange={handleChange}
                    className="h-14 px-6 text-base bg-muted/30 border-border rounded-xl focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <Input
                  type="text"
                  name="subject"
                  placeholder="Subject"
                  value={formData.subject}
                  onChange={handleChange}
                  className="h-14 px-6 text-base bg-muted/30 border-border rounded-xl focus:ring-2 focus:ring-primary/20"
                  required
                />

                <Textarea
                  name="message"
                  placeholder="Message"
                  value={formData.message}
                  onChange={handleChange}
                  rows={8}
                  className="px-6 py-4 text-base bg-muted/30 border-border rounded-xl focus:ring-2 focus:ring-primary/20 resize-none"
                  required
                />

                <Button
                  type="submit"
                  className="w-full h-14 bg-foreground hover:bg-foreground/90 text-background text-base font-medium rounded-xl transition-all duration-300"
                >
                  Send Message
                </Button>
              </form>
            </motion.div>

            {/* Map Section */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="rounded-2xl overflow-hidden h-[550px] shadow-lg relative group"
            >
              {BRAND.mapEmbedUrl ? (
                <iframe
                  src={BRAND.mapEmbedUrl}
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                // No store location yet (online-only): same box, brand photo instead of a map.
                <div className="relative h-full w-full">
                  <img src="https://res.cloudinary.com/dcoimqij/image/upload/f_auto,q_auto,w_1200/v1790164203/ishaputrabotanicals/demo/skwawcwe23osyuspv5hf.jpg" alt={BRAND.name} className="h-full w-full object-cover" loading="lazy" />
                  <div className="absolute inset-0 bg-gradient-to-t from-charcoal/85 via-charcoal/20 to-transparent" />
                  <div className="absolute bottom-8 left-8 right-8">
                    <p className="text-xs uppercase tracking-[0.3em] text-highlight-soft mb-2">{BRAND.tagline}</p>
                    <p className="text-2xl font-heading text-charcoal-foreground">Shipping across India</p>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
      </div>
      <Footer />
    </>
  );
};

export default Contact;
