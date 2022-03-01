import { useEffect } from "preact/hooks";
import styles from "./TableOfContents.module.css";

export const TableOfContents = (props) => {
  const { headers } = props;

  useEffect(() => {
    console.log("toc", headers);
  }, [headers]);

  return (
    <div className={styles.toc}>
      {headers.map((header) => (
        <div className={styles.tocHeader}>
          <a
            className={`${styles.tocHeaderLink} ${
              header.depth === 3 ? styles.subheader : styles.header
            }`}
            href={`#${header.slug}`}
          >
            {header.text}
          </a>
        </div>
      ))}
    </div>
  );
};
