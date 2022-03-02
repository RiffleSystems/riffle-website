import { useEffect, useState } from "preact/hooks";
import styles from "./TableOfContents.module.css";

export const TableOfContents = (props) => {
  const { headers } = props;

  const [activeSlug, setActiveSlug] = useState(null);

  const isHeaderVisible = (header) => {
    if (header.depth === 2) {
      return true;
    } else if (header.depth === 3) {
      const headerIndex = headers.indexOf(header);
      const parentHeader = headers
        .slice(0, headerIndex)
        .filter((h) => h.depth === 2)
        .slice(-1)[0];
      return parentHeader && parentHeader.slug === activeSlug;
    }
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.length > 0) {
          const activeId = entries[0].target.getAttribute("id");
          setActiveSlug(activeId);
        }
      },
      // Only count as visible when it's more than 1/3 from bottom of page
      { rootMargin: "0px 0px -33% 0px" }
    );

    // Track all sections that have an `id` applied
    document.querySelectorAll("h2[id]").forEach((section) => {
      observer.observe(section);
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
                header.slug === activeSlug ? styles.active : ""
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
