import { useState } from "react";
import { motion } from "framer-motion";
import { MapPin, Phone, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
            backgroundImage: "url('https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=2070')",
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
            style={{ fontFamily: "'Poppins', sans-serif" }}
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
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Get In Touch
          </h2>
          <p className="text-muted-foreground text-lg max-w-3xl mx-auto">
            We are your premier destination for exquisite silver jewelry and furniture in Kakinada.
            Discover our stunning collection of handcrafted silver pieces that blend tradition with contemporary elegance.
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
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Address:
              </h3>
            </div>
            <div className="ml-10">
              <p className="text-muted-foreground mb-1">Ramasomayajulu St, Rama Rao Peta</p>
              <p className="text-muted-foreground">Kakinada, Andhra Pradesh 533001</p>
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
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Contact Us
              </h3>
            </div>
            <div className="ml-10">
              <p className="text-muted-foreground mb-1">Mobile: 063049 60489</p>
              <p className="text-muted-foreground mb-1">Website: sreerasthusiIvers.co.in</p>
              <p className="text-muted-foreground">Mail: info@sreerasthusiIvers.co.in</p>
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
              <h3 className="text-2xl font-normal text-foreground" style={{ fontFamily: "'Poppins', sans-serif" }}>
                Hour Of Operation
              </h3>
            </div>
            <div className="ml-10">
              <p className="text-muted-foreground mb-1">Monday-Saturday: 9:00 am - 8:00 pm </p>
              <p className="text-muted-foreground">Sundays: 10:00 am - 6:00 pm </p>
            </div>
          </motion.div>
        </div>

        {/* Contact Form and Map Section - Side by Side */}
        <div className="max-w-7xl mx-auto">
          <h2
            className="text-4xl md:text-5xl font-light text-foreground text-center mb-12"
            style={{ fontFamily: "'Poppins', sans-serif" }}
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
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2221.0993420701366!2d82.23309095095026!3d16.957824580737896!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a38290006734e2b%3A0x9f8b6cdf933bc2a!2sSreerastu%20silvers!5e0!3m2!1sen!2sin!4v1772431378848!5m2!1sen!2sin"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              
              {/* Clickable Overlay to Open in Google Maps */}
              <a
                href="https://www.google.com/maps/place/Sreerastu+silvers/@16.957928,82.2329618,17.66z/data=!4m6!3m5!1s0x3a38290006734e2b:0x9f8b6cdf933bc2a!8m2!3d16.9577817!4d82.2346344!16s%2Fg%2F11xclhs7tw?entry=ttu&g_ep=EgoyMDI1MTIwOS4wIKXMDSoASAFQAw%3D%3D"
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-4 right-4 z-10 bg-background/95 backdrop-blur-sm px-5 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 group-hover:scale-105"
              >
                <MapPin className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium text-foreground">Open in Google Maps</span>
              </a>
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
