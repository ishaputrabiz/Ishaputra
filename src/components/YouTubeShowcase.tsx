import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Play, Youtube as YoutubeIcon, ChevronLeft, ChevronRight, Maximize } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  subscribeHomeVideos,
  youtubeThumb,
  type HomeVideo,
} from "@/services/homeContentService";
import useAutoScroll from "@/hooks/useAutoScroll";
import { subscribeFooterSettings } from "@/services/siteSettingsService";

const INERT = { inert: "" } as Record<string, string>;

const aspectClass = (r?: HomeVideo["aspectRatio"]) =>
  r === "9:16" ? "aspect-[9/16]" : "aspect-video";

const InlinePlayer = ({
  video,
  playing,
  onPlay,
  onOpen,
  className = "",
  rounded = "rounded-card",
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
      className={`relative w-full ${ratioCls} ${rounded} overflow-hidden bg-charcoal ${className}`}
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
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            loading="lazy"
          />
          <div aria-hidden="true" className="photo-scrim absolute inset-0" />
          <div className="absolute inset-0 grid place-items-center">
            <span className="relative grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-panel transition-transform duration-press ease-out group-hover:scale-105 group-active:scale-[0.97] md:size-20">
              <Play aria-hidden="true" className="ml-1 size-5 fill-current md:size-7" />
            </span>
          </div>
        </button>
      )}
      {/* Full screen button: opens the video in a dialog */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        className="absolute bottom-3 right-3 z-raised inline-flex h-8 items-center gap-1.5 rounded-control bg-charcoal/75 px-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-charcoal-foreground backdrop-blur-sm transition-[background-color,transform] duration-press ease-out after:absolute after:-inset-1.5 after:content-[''] hover:bg-charcoal/90 active:scale-[0.97]"
        aria-label={`Open ${video.title} in full screen`}
      >
        <Maximize aria-hidden="true" className="size-3" /> Full screen
      </button>
    </div>
  );
};

const YouTubeShowcase = () => {
  const [videos, setVideos] = useState<HomeVideo[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<HomeVideo | null>(null);
  const [playingIds, setPlayingIds] = useState<Set<string>>(new Set());
  const [channelUrl, setChannelUrl] = useState<string | null>(null);
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

  // "View channel" appears only when Admin > Site settings has an active YouTube link.
  useEffect(() => {
    const unsub = subscribeFooterSettings((settings) => {
      const youtube = settings.socialLinks?.find(
        (l) => l.platform === "youtube" && l.active && /^https?:\/\//.test(l.url || "")
      );
      setChannelUrl(youtube ? youtube.url : null);
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
    <section className="relative w-full overflow-hidden py-12 md:py-20">
      {/* gold ambient glow */}

      <div className="container-custom relative">
        {/* header */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8 md:mb-10 px-1 md:px-0">
          <div>
            <h2
              className="text-2xl font-semibold text-foreground [text-wrap:balance] md:text-4xl"
              style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
            >
              The Ishaputra film reel
            </h2>
            <p className="mt-3 hidden max-w-xl text-sm text-muted-foreground md:block">
              How we make it, how to use it, and the herbs behind every formula.
            </p>
          </div>
          {channelUrl && (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="link-arrow hidden md:inline-flex"
            >
              View channel <YoutubeIcon aria-hidden="true" className="size-4" />
            </a>
          )}
        </div>

        {/* Featured spotlight (only when admin has explicitly marked at least one as featured) */}
        {featured && (
          <motion.div
            key={featured.videoId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.modal, ease: EASE_OUT }}
            className={`relative mx-auto w-full ${
              featured.aspectRatio === "9:16" ? "max-w-[22rem] md:max-w-[26rem]" : "max-w-[72rem]"
            }`}
          >
            <div className="relative panel overflow-hidden">
              <InlinePlayer
                video={featured}
                playing={playingIds.has(featured.id || featured.videoId)}
                onPlay={() => playInline(featured, featured.id || featured.videoId)}
                onOpen={() => {
                  setPlayingIds(prev => { const s = new Set(prev); s.delete(featured.id || featured.videoId); return s; });
                  openVideo(featured);
                }}
                rounded="rounded-panel"
              />
              {!playingIds.has(featured.id || featured.videoId) && (
                <>
                <span className="tag-dark absolute left-4 top-4 z-raised">Featured</span>
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-raised p-5 text-left md:p-8">
                  <h3
                    className="on-photo text-lg font-medium leading-tight text-charcoal-foreground md:text-2xl"
                    style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                  >
                    {featured.title}
                  </h3>
                  {featured.description && (
                    <p className="on-photo mt-1.5 line-clamp-2 max-w-2xl text-xs text-charcoal-foreground/85 md:text-sm">
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
            <h3 className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground md:text-sm">
              {featured ? "More from the reel" : "Latest stories"}
            </h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Scroll videos left"
                onClick={() => scrollByPage("prev")}
                disabled={!canScroll}
                className="btn-round"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll videos right"
                onClick={() => scrollByPage("next")}
                disabled={!canScroll}
                className="btn-round"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>

          <div className="relative">
                        
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
                const isLoopCopy = i >= videos.length;
                return (
                  <div
                    key={cardKey}
                    aria-hidden={isLoopCopy || undefined}
                    {...(isLoopCopy ? INERT : {})}
                    className={`group flex-shrink-0 snap-center overflow-hidden rounded-card border bg-card text-left transition-[transform,border-color,box-shadow] [transition-duration:220ms] ease-out hover:-translate-y-1 ${
                      // Phone cards are sized off the viewport so a reel is
                      // watchable, with the next one peeking to invite a swipe.
                      isPortrait
                        ? "w-[62vw] max-w-[260px] md:w-[216px]"
                        : "w-[82vw] max-w-[340px] md:w-[320px]"
                    } ${
                      isFeaturedActive
                        ? "border-primary shadow-[var(--shadow-card-hover)]"
                        : "border-foreground/[0.07] hover:border-primary/35 hover:shadow-[var(--shadow-card-hover)]"
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
                        <span className="tag-dark absolute left-2 top-2 z-raised">Featured</span>
                      )}
                      {!isPlaying && isFeaturedActive && (
                        <span className="absolute right-2 top-2 z-raised rounded-chip bg-primary px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-primary-foreground">
                          In spotlight
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p
                        className="text-sm font-medium leading-snug line-clamp-2 text-foreground"
                        style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                      >
                        {v.title}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}
      </div>

      <Dialog open={!!selectedVideo} onOpenChange={(open) => !open && setSelectedVideo(null)}>
        <DialogContent className="w-[96vw] max-w-7xl overflow-hidden rounded-panel border-none bg-charcoal p-0 text-charcoal-foreground shadow-panel">
          {/* Accessible title/description for screen readers (Radix requirement) */}
          <DialogTitle className="sr-only">{selectedVideo?.title || "Video story"}</DialogTitle>
          <DialogDescription className="sr-only">
            {selectedVideo?.description || "Video player"}
          </DialogDescription>
          {selectedVideo && (
            <div className="flex max-h-[90vh] flex-col overflow-y-auto">
              <div className="px-5 pt-5 pr-14 sm:px-6 sm:pt-6">
                <p className="text-[10px] uppercase tracking-[0.28em] text-charcoal-foreground/65">Video story</p>
                <h3
                  className="mt-2 text-lg font-medium text-charcoal-foreground sm:text-2xl"
                  style={{ fontFamily: "var(--font-heading)", fontStretch: "var(--font-heading-stretch)" }}
                >
                  {selectedVideo.title}
                </h3>
                {selectedVideo.description && (
                  <p className="mt-2 max-w-3xl text-sm text-charcoal-foreground/75">
                    {selectedVideo.description}
                  </p>
                )}
              </div>

              <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
                <div className={`mx-auto w-full ${selectedVideo.aspectRatio === "9:16" ? "max-w-[26rem]" : "max-w-6xl"}`}>
                  <div className={`relative overflow-hidden rounded-card bg-charcoal ${aspectClass(selectedVideo.aspectRatio)}`}>
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
