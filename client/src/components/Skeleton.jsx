/* Skeleton placeholder. Replaces "Loading..." text with a pulsing
   shimmer block in the shape of the real content, so the perceived
   wait feels intentional instead of blank. */

export function Skeleton({
  variant = "line",
  width,
  height,
  className = "",
  style = {},
  ...rest
}) {
  const classes = ["skeleton", `skeleton-${variant}`, className].filter(Boolean).join(" ");
  const inlineStyle = { ...style };
  if (width !== undefined) inlineStyle.width = width;
  if (height !== undefined) inlineStyle.height = height;

  return <div className={classes} style={inlineStyle} aria-hidden="true" {...rest} />;
}

/* Pre-composed skeletons for the common spots. */

export function SkeletonLiftCard() {
  return (
    <article className="lift-card skeleton-lift-card" aria-hidden="true">
      <div className="lift-card-top">
        <div>
          <Skeleton variant="title" width="60%" />
          <Skeleton variant="line" width="45%" style={{ marginTop: "0.45rem" }} />
        </div>
      </div>
      <Skeleton variant="line" width="80%" style={{ marginTop: "0.8rem" }} />
    </article>
  );
}

export function SkeletonDatePill() {
  return (
    <div className="date-pill skeleton-date-pill" aria-hidden="true">
      <Skeleton variant="line" width="60%" />
      <Skeleton variant="line-lg" width="80%" style={{ marginTop: "0.3rem" }} />
    </div>
  );
}

export function SkeletonRosterRow() {
  return (
    <tr className="skeleton-roster-row" aria-hidden="true">
      <td>
        <div className="table-name-cell">
          <Skeleton variant="avatar" />
          <div style={{ flex: 1 }}>
            <Skeleton variant="title" width="55%" />
            <Skeleton variant="line" width="70%" style={{ marginTop: "0.35rem" }} />
          </div>
        </div>
      </td>
      <td>
        <Skeleton variant="badge" width="70px" />
      </td>
      <td>
        <Skeleton variant="line" width="120px" />
      </td>
      <td>
        <Skeleton variant="line" width="140px" />
      </td>
    </tr>
  );
}
