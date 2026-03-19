import { useEffect, useState } from 'react';

const PHONE_MAX_WIDTH = 767;
const DESKTOP_MIN_WIDTH = 1180;
const COARSE_POINTER_QUERY = '(pointer: coarse)';

type ResponsiveViewportSnapshot = {
  width: number;
  height: number;
  isPhone: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isCompact: boolean;
  isCoarsePointer: boolean;
  starmapUsesDrawerPanels: boolean;
};

function readSnapshot(): ResponsiveViewportSnapshot {
  if (typeof window === 'undefined') {
    return {
      width: DESKTOP_MIN_WIDTH,
      height: 900,
      isPhone: false,
      isTablet: false,
      isDesktop: true,
      isCompact: false,
      isCoarsePointer: false,
      starmapUsesDrawerPanels: false,
    };
  }

  const width = window.innerWidth;
  const height = window.innerHeight;
  const isPhone = width <= PHONE_MAX_WIDTH;
  const isDesktop = width >= DESKTOP_MIN_WIDTH;
  const isTablet = !isPhone && !isDesktop;
  const isCoarsePointer = window.matchMedia(COARSE_POINTER_QUERY).matches;
  const isCompact = !isDesktop || height < 760;
  const starmapUsesDrawerPanels = width < 1180 || (isCoarsePointer && width < 1360);

  return {
    width,
    height,
    isPhone,
    isTablet,
    isDesktop,
    isCompact,
    isCoarsePointer,
    starmapUsesDrawerPanels,
  };
}

export function useResponsiveViewport() {
  const [snapshot, setSnapshot] = useState<ResponsiveViewportSnapshot>(() => readSnapshot());

  useEffect(() => {
    const mediaQuery = window.matchMedia(COARSE_POINTER_QUERY);

    const updateSnapshot = () => {
      setSnapshot(previous => {
        const next = readSnapshot();
        if (
          previous.width === next.width
          && previous.height === next.height
          && previous.isPhone === next.isPhone
          && previous.isTablet === next.isTablet
          && previous.isDesktop === next.isDesktop
          && previous.isCompact === next.isCompact
          && previous.isCoarsePointer === next.isCoarsePointer
          && previous.starmapUsesDrawerPanels === next.starmapUsesDrawerPanels
        ) {
          return previous;
        }
        return next;
      });
    };

    updateSnapshot();
    window.addEventListener('resize', updateSnapshot);
    mediaQuery.addEventListener('change', updateSnapshot);

    return () => {
      window.removeEventListener('resize', updateSnapshot);
      mediaQuery.removeEventListener('change', updateSnapshot);
    };
  }, []);

  return snapshot;
}