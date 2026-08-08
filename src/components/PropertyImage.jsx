export function PropertyImage({ src, alt, priority = false, onError }) {
  if (!src) return null;

  return (
    <img
      src={src}
      alt={alt}
      width="1024"
      height="768"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onError={onError}
    />
  );
}
