import { useEffect, useState } from "preact/hooks";
import styles from "./TableOfContents.module.css";

export const TableOfContents = (props) => {
  const { headers } = props;

  const [activeSlug, setActiveSlug] = useState(null);

  const getParent = (header) => {
    if (header === undefined) {
      return undefined;
    }
    if (header.depth === 2) {
      return header;
    }
    const headerIndex = headers.indexOf(header);
    return headers
      .slice(0, headerIndex)
      .filter((h) => h.depth === 2)
      .slice(-1)[0];
  };

  const isHeaderVisible = (header) => {
    if (header.depth === 2) {
      return true;
    } else if (header.depth === 3) {
      const parentHeader = getParent(header);
      const activeHeader = getParent(
        headers.find((h) => h.slug === activeSlug)
      );
      return parentHeader && parentHeader === activeHeader;
    }
  };

  const isHeaderActive = (header) => {
    const activeHeader = headers.find((h) => h.slug === activeSlug);
    if (activeHeader === undefined) return false;

    return header === activeHeader || header === getParent(activeHeader);
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.filter((e) => e.isIntersecting);
        if (intersecting.length > 0) {
          console.log(intersecting.map((e) => e.target.getAttribute("id")));
          const activeId = intersecting.slice(-1)[0].target.getAttribute("id");
          setActiveSlug(activeId);
        }
      },
      // Only count as visible when it's more than 1/3 from bottom of page
      { rootMargin: "0px 0px -33% 0px" }
    );

    // Track all sections that have an `id` applied
    document.querySelectorAll("h2[id], h3[id]").forEach((heading) => {
      observer.observe(heading);
    });
  }, []);

  return (
    <nav className={styles.toc}>
      {headers
        .filter((h) => isHeaderVisible(h))
        .map((header) => (
          <div
            className={header.depth === 3 ? styles.subheader : styles.header}
          >
            <a
              className={`${styles.tocHeaderLink} ${
                isHeaderActive(header) ? styles.active : ""
              }`}
              href={`#${header.slug}`}
            >
              {header.text}
            </a>
          </div>
        ))}
    </nav>
  );
};
