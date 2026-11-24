"use client";

import NextImage, { type ImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { isImageUrlReady, markImageUrlReady } from "@/lib/assets/AssetLoader";

/**
 * Image UI alignée sur le pipeline AssetLoader :
 * - `loading="eager"` par défaut (évite le chargement tardif quand l'écran est déjà visible).
 * - Si l'URL est déjà décodée par AssetLoader → rendu instantané (`decoding="sync"`), aucun fondu.
 * - Sinon (upload distant ou visuel hors manifeste) → fondu doux de 160 ms dès que l'image est prête.
 */
export function GameImage({
  src,
  priority,
  loading,
  decoding,
  className,
  onLoad,
  onError,
  ...rest
}: ImageProps) {
  const url = typeof src === "string" ? src : null;
  const preloaded = typeof window === "undefined" || !url || isImageUrlReady(url);
  const [fadeUrl, setFadeUrl] = useState<string | null>(() => (preloaded ? null : url));
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [erroredUrl, setErroredUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (preloaded || !url) return;
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth > 0) {
      markImageUrlReady(url);
      setLoadedUrl(url);
      return;
    }
    setFadeUrl(url);
  }, [preloaded, url]);

  const handleLoad = useCallback<NonNullable<ImageProps["onLoad"]>>(
    (event) => {
      if (url) markImageUrlReady(url);
      setLoadedUrl(url);
      onLoad?.(event);
    },
    [onLoad, url],
  );

  const handleError = useCallback<NonNullable<ImageProps["onError"]>>(
    (event) => {
      setErroredUrl(url);
      onError?.(event);
    },
    [onError, url],
  );

  const ready = preloaded || loadedUrl === url || erroredUrl === url;
  const shouldFade = (!preloaded || fadeUrl === url) && erroredUrl !== url;

  const classes = [
    className,
    shouldFade ? "nj-img-fade" : "",
    !ready ? "nj-img-pending" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <NextImage
      {...rest}
      ref={imgRef}
      src={src}
      priority={priority}
      loading={priority ? undefined : (loading ?? "eager")}
      decoding={decoding ?? (ready && !shouldFade ? "sync" : "async")}
      onLoad={handleLoad}
      onError={handleError}
      className={classes || undefined}
    />
  );
}

export default GameImage;
