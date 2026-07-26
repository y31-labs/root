import { Shimmer } from '@workspace/ui/components/ai-elements/shimmer';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

interface ChatHistoryTitleProps {
  generating: boolean;
  title: string;
}

interface MarqueeMetrics {
  distance: number;
  duration: number;
}

type MarqueeStyle = CSSProperties & {
  '--chat-title-marquee-distance'?: string;
  '--chat-title-marquee-duration'?: string;
};

const MARQUEE_GAP_PX = 32;
const MARQUEE_SPEED_PX_PER_SECOND = 28;

export function ChatHistoryTitle({ generating, title }: ChatHistoryTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);
  const [metrics, setMetrics] = useState<MarqueeMetrics>({ distance: 0, duration: 0 });

  const measure = useCallback(() => {
    const container = containerRef.current;
    const titleElement = titleRef.current;
    if (!container || !titleElement) return;
    const titleWidth = titleElement.scrollWidth;
    const overflowing = titleWidth > container.clientWidth;
    const distance = overflowing ? titleWidth + MARQUEE_GAP_PX : 0;
    const duration = overflowing ? Math.max(4, distance / MARQUEE_SPEED_PX_PER_SECOND) : 0;
    setMetrics((current) =>
      current.distance === distance && current.duration === duration
        ? current
        : { distance, duration },
    );
  }, []);

  useLayoutEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (titleRef.current) observer.observe(titleRef.current);
    return () => observer.disconnect();
  }, [measure, title]);

  const overflowing = metrics.distance > 0;
  const style: MarqueeStyle = overflowing
    ? {
        '--chat-title-marquee-distance': `${metrics.distance}px`,
        '--chat-title-marquee-duration': `${metrics.duration}s`,
      }
    : {};

  return (
    <div
      className='chat-history-title scroll-fade-x min-w-0 flex-1 group-data-[collapsible=icon]:hidden'
      data-overflowing={overflowing || undefined}
      ref={containerRef}
      style={style}
    >
      <span className='chat-history-title-track'>
        <span className='chat-history-title-copy' ref={titleRef}>
          {generating ? <Shimmer as='span'>{title}</Shimmer> : title}
        </span>
        {overflowing ? (
          <span aria-hidden='true' className='chat-history-title-copy'>
            {generating ? <Shimmer as='span'>{title}</Shimmer> : title}
          </span>
        ) : null}
      </span>
    </div>
  );
}
