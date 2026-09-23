import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, Youtube as YoutubeIcon, ChevronLeft, ChevronRight, Maximize } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  subscribeHomeVideos,
  youtubeThumb,
  type HomeVideo,
} from "@/services/homeContentService";
import useAutoScroll from "@/hooks/useAutoScroll";

const aspectClass = (r?: HomeVideo["aspectRatio"]) =>
  r === "9:16" ? "aspect-[9/16]" : "aspect-video";

const InlinePlayer = ({
  video,
  playing,
  onPlay,
  onOpen,
  className = "",
  rounded = "rounded-2xl",
}: {
  video: HomeVideo;
  playing: boolean;
  onPlay: () => void;
  onOpen: () => void;
  className?: string;
  rounded?: string;
}) => {
  const ratioCls = aspectClass(video.aspectRatio);

  return (
    <div
      className={`relative w-full ${ratioCls} ${rounded} overflow-hidden bg-black ${className}`}
    >
      {playing ? (
        <iframe
          key={video.videoId}
          title={video.title}
          src={`https://www.youtube.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1`}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={onPlay}
          className="group absolute inset-0 w-full h-full"
          aria-label={`Play ${video.title}`}
        >
          <img
            src={video.thumbnailUrl || youtubeThumb(video.videoId)}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="relative grid place-items-center w-14 h-14 md:w-20 md:h-20 rounded-full bg-white/95 text-black shadow-2xl transition-transform group-hover:scale-110">
              <span className="absolute inset-0 rounded-full animate-ping bg-white/40" />
              <Play className="w-5 h-5 md:w-7 md:h-7 ml-1 fill-current" />
            </span>
          </div>
        </button>
      )}
      {/* Full Screen button — opens popup dialog */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="absolute bottom-3 right-3 z-10 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-sm transition-all duration-300 hover:bg-black/80 hover:scale-105"
        aria-label={`Open ${video.title} in full screen`}
      >
        <Maximize className="h-3 w-3" /> Full Screen
      </button>
    </div>
  );
};

const YouTubeShowcase = () => {
  const [videos, setVideos] = useState<HomeVideo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<HomeVideo | null>(null);
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());
  const { scrollerRef, scrollByPage, canScroll } = useAutoScroll({
    speed: 0.45,
    resumeDelay: 2600,
    loop: true,
    direction: -1,
    loopItemCount: videos.length,
  });

  useEffect(() => {
    const unsub = subscribeHomeVideos((vids) => {
      const active = vids.filter((v) => v.active && v.videoId);
      setVideos(active);
    });
    return unsub;
  }, []);

  const featuredVideos = useMemo(
    () => videos.filter((v) => v.featured),
    [videos]
  );

  // Featured slot picks the explicitly-featured video the user last clicked,
  // falling back to the first featured one. With nothing flagged, the newest
  // video takes the spotlight anyway - a lone film shown as a thumbnail in a
  // half-empty strip reads as an afterthought, especially on a phone.
  const featured = useMemo(() => {
    if (featuredVideos.length === 0) return videos[0] || null;
    const matched = featuredVideos.find(
      (v) => (v.id || v.videoId) === activeId
    );
    return matched || featuredVideos[0];
  }, [featuredVideos, activeId, videos]);

  if (videos.length === 0) return null;

  const playInline = (video: HomeVideo, key: string) => {
    if (video.featured) {
      setActiveId(video.id || video.videoId);
    }
    setPlayingIds((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  };

  const openVideo = (video: HomeVideo) => {
    if (video.featured) {
      setActiveId(video.id || video.videoId);
    }
    setSelectedVideo(video);
  };

  const stripVideos = canScroll && videos.length > 1 ? [...videos, ...videos] : videos;

  return (
    <section className="relative w-full py-14 md:py-24 bg-gradient-to-b from-background via-background to-[#fdf7eb] dark:to-zinc-950 overflow-hidden">
      {/* gold ambient glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-[radial-gradient(circle,rgba(212,175,55,0.12)_0%,transparent_60%)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-0 w-[500px] h-[500px] rounded-full bg-[radial-gradient(circle,rgba(131,39,41,0.10)_0%,transparent_60%)] blur-3xl" />

      <div className="container-custom relative">
        {/* header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 md:mb-10 px-1 md:px-0">
          <div>
            <p className="text-[10px] uppercase tracking-[0.32em] text-primary mb-3 font-medium flex items-center gap-2">
              <YoutubeIcon className="w-3.5 h-3.5" /> Watch · Discover · Shop
            </p>
            <h2
              className="text-2xl md:text-4xl font-medium tracking-tight text-foreground"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              The Sreerasthu Film Reel
            </h2>
            <p className="hidden md:block mt-3 text-sm text-muted-foreground max-w-xl font-light">
              Behind the craft, story films, and product showcases from our atelier.
            </p>
          </div>
          <a
            href="https://www.youtube.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase text-foreground hover:text-primary transition-colors"
          >
            View Channel <YoutubeIcon className="w-4 h-4" />
          </a>
        </div>

        {/* Featured spotlight (only when admin has explicitly marked at least one as featured) */}
        {featured && (
          <motion.div
            key={featured.videoId}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className={`relative mx-auto w-full ${
              featured.aspectRatio === "9:16" ? "max-w-[22rem] md:max-w-[26rem]" : "max-w-[72rem]"
            }`}
          >
            <div className="absolute -inset-[2px] rounded-[26px] bg-gradient-to-br from-[#d4af37] via-[#f5d76e] to-[#a07a1f] opacity-90 blur-[1px]" />
            <div className="relative shadow-[0_30px_70px_-30px_rgba(0,0,0,0.55)] rounded-[24px] overflow-hidden">
              <InlinePlayer
                video={featured}
                playing={playingIds.has(featured.id || featured.videoId)}
                onPlay={() => playInline(featured, featured.id || featured.videoId)}
                onOpen={() => {
                  setPlayingIds(prev => { const s = new Set(prev); s.delete(featured.id || featured.videoId); return s; });
                  openVideo(featured);
                }}
                rounded="rounded-[24px]"
              />
              {!playingIds.has(featured.id || featured.videoId) && (
                <>
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 z-10"
                >
                  <span className="relative flex w-2 h-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.26em] text-white font-semibold">
                    Featured
                  </span>
                </motion.div>
                <div className="absolute left-0 right-0 bottom-0 p-5 md:p-8 text-left z-10 pointer-events-none">
                  <h3
                    className="text-white text-lg md:text-2xl font-medium leading-tight"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {featured.title}
                  </h3>
                  {featured.description && (
                    <p className="mt-1.5 text-white/75 text-xs md:text-sm font-light line-clamp-2 max-w-2xl">
                      {featured.description}
                    </p>
                  )}
                </div>
                </>
              )}
            </div>
          </motion.div>
        )}

        {/* Horizontal playlist strip — every active video, plays inline.
            With a single film there is nothing to browse: the spotlight above
            is the whole reel. */}
        {videos.length > 1 && (
        <div className={featured ? "mt-8 md:mt-12" : ""}>
          <div className="flex items-center justify-between mb-4 px-1">
            <h4 className="text-xs md:text-sm uppercase tracking-[0.28em] text-muted-foreground font-medium">
              {featured ? "More from the Reel" : "Latest Stories"}
            </h4>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll videos left"
                onClick={() => scrollByPage("prev")}
                disabled={!canScroll}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 backdrop-blur flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:cursor-default disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll videos right"
                onClick={() => scrollByPage("next")}
                disabled={!canScroll}
                className="w-8 h-8 md:w-10 md:h-10 rounded-full border border-border/70 bg-background/90 dark:bg-zinc-900/80 backdrop-blur flex items-center justify-center hover:bg-primary hover:text-white hover:border-primary transition-colors disabled:cursor-default disabled:opacity-40"
              >
                <ChevronRight className="w-3.5 h-3.5 md:w-4 md:h-4" />
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 md:w-16 bg-gradient-to-r from-background to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 md:w-16 bg-gradient-to-l from-background to-transparent" />

            <div
              ref={scrollerRef}
              className="flex items-stretch gap-3 md:gap-4 overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-2 px-1"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {stripVideos.map((v, i) => {
                const key = v.id || v.videoId;
                const cardKey = `${key}-${i}`;
                const isFeaturedActive =
                  featured && key === (featured.id || featured.videoId);
                const isPortrait = v.aspectRatio === "9:16";
                const isPlaying = playingIds.has(cardKey);
                return (
                  <motion.div
                    key={cardKey}
                    whileHover={{ y: -4 }}
                    transition={{ duration: 0.25 }}
                    className={`group flex-shrink-0 snap-center text-left rounded-2xl overflow-hidden border-2 transition-all bg-card ${
                      // Phone cards are sized off the viewport so a reel is
                      // watchable, with the next one peeking to invite a swipe.
                      isPortrait
                        ? "w-[62vw] max-w-[260px] md:w-[216px]"
                        : "w-[82vw] max-w-[340px] md:w-[320px]"
                    } ${
                      isFeaturedActive
                        ? "border-primary shadow-[0_18px_36px_-18px_rgba(212,175,55,0.6)]"
                        : "border-transparent shadow-md hover:shadow-xl"
                    }`}
                  >
                    <div className="relative">
                      <InlinePlayer
                        video={v}
                        playing={isPlaying}
                        onPlay={() => playInline(v, cardKey)}
                        onOpen={() => {
                          setPlayingIds(prev => { const s = new Set(prev); s.delete(cardKey); return s; });
                          openVideo(v);
                        }}
                        rounded=""
                      />
                      {!isPlaying && v.featured && (
                        <span className="absolute top-2 left-2 z-10 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/95 text-white text-[9px] uppercase tracking-[0.2em] font-semibold shadow">
                          ★ Featured
                        </span>
                      )}
                      {!isPlaying && isFeaturedActive && (
                        <span className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-primary/95 text-white text-[9px] uppercase tracking-[0.22em] font-semibold">
                          In Spotlight
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p
                        className="text-sm font-medium leading-snug line-clamp-2 text-foreground"
                        style={{ fontFamily: "'Playfair Display', serif" }}
                      >
                        {v.title}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>

      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="w-[96vw] max-w-7xl border-none bg-black/95 p-0 text-white shadow-[0_32px_90px_-24px_rgba(0,0,0,0.85)] sm:rounded-2xl overflow-hidden">
          {/* Accessible title/description for screen readers (Radix requirement) */}
          <DialogTitle className="sr-only">{selectedVideo?.title || "Video story"}</DialogTitle>
          <DialogDescription className="sr-only">
            {selectedVideo?.description || "Video player"}
          </DialogDescription>
          {selectedVideo && (
            <div className="flex max-h-[90vh] flex-col overflow-y-auto">
              <div className="px-5 pt-5 pr-14 sm:px-6 sm:pt-6">
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/60">Video Story</p>
                <h3
                  className="mt-2 text-lg font-medium text-white sm:text-2xl"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {selectedVideo.title}
                </h3>
                {selectedVideo.description && (
                  <p className="mt-2 max-w-3xl text-sm font-light text-white/70">
                    {selectedVideo.description}
                  </p>
                )}
              </div>

              <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                <div className={`mx-auto w-full ${selectedVideo.aspectRatio === "9:16" ? "max-w-[26rem]" : "max-w-6xl"}`}>
                  <div className={`relative overflow-hidden rounded-2xl bg-black ${aspectClass(selectedVideo.aspectRatio)}`}>
                    <iframe
                      key={selectedVideo.videoId}
                      title={selectedVideo.title}
                      src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&controls=1`}
                      className="absolute inset-0 h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </section>
  );
};

export default YouTubeShowcase;
