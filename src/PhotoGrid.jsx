function cssUrl(url) {
  return String(url).replace(/["\\]/g, (c) => (c === '"' ? "%22" : "%5C"));
}

// Shows the whole photo (never cropped) over a soft blurred copy of itself,
// so portrait phone photos do not leave ugly black bars.
export function PhotoFrame({ url, alt = "", aspect = "4 / 3", style, children }) {
  return (
    <span
      style={{
        position: "relative",
        display: "block",
        width: "100%",
        aspectRatio: aspect,
        overflow: "hidden",
        background: "#0b131d",
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: -14,
          backgroundImage: `url("${cssUrl(url)}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(14px) brightness(0.5)",
        }}
      />
      <img
        src={url}
        alt={alt}
        loading="lazy"
        style={{ position: "relative", display: "block", width: "100%", height: "100%", objectFit: "contain" }}
      />
      {children}
    </span>
  );
}

export function NumberBadge({ children }) {
  return (
    <span
      style={{
        position: "absolute",
        left: 8,
        top: 8,
        minWidth: 26,
        height: 26,
        padding: "0 6px",
        borderRadius: 13,
        background: "#1a6bd2",
        color: "#fff",
        fontSize: "0.8rem",
        fontWeight: 700,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
      }}
    >
      {children}
    </span>
  );
}

// A clickable thumbnail that opens the photo viewer.
export function PhotoTile({ url, caption, onClick, ariaLabel, aspect = "4 / 3", badge, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      style={{
        display: "block",
        width: "100%",
        padding: 0,
        margin: 0,
        borderRadius: 10,
        overflow: "hidden",
        border: "1px solid #1a2a3a",
        background: "#0b131d",
        cursor: "zoom-in",
        ...style,
      }}
    >
      <PhotoFrame url={url} alt={caption || ""} aspect={aspect}>
        {badge ? <NumberBadge>{badge}</NumberBadge> : null}
      </PhotoFrame>
    </button>
  );
}

// images: [{ url, caption? }]. Captions show under each thumbnail.
export default function PhotoGrid({ images, onOpen, openLabel, minWidth = 150, aspect = "4 / 3" }) {
  if (!images.length) return null;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(auto-fill, minmax(${minWidth}px, 1fr))`,
        gap: "0.6rem",
      }}
    >
      {images.map((image, i) => (
        <figure key={`${image.url}-${i}`} style={{ margin: 0, minWidth: 0 }}>
          <PhotoTile
            url={image.url}
            caption={image.caption}
            aspect={aspect}
            ariaLabel={openLabel ? openLabel(i + 1) : undefined}
            onClick={() => onOpen(i)}
          />
          {image.caption ? (
            <figcaption style={{ color: "#8899aa", fontSize: "0.78rem", marginTop: "0.3rem", lineHeight: 1.35 }}>
              {image.caption}
            </figcaption>
          ) : null}
        </figure>
      ))}
    </div>
  );
}
