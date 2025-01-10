import { shuffle } from "lodash";
import { h } from "preact";

export const AuthorList = (props) => {
  const { authors } = props;

  if (!authors || authors.length === 0) {
    return null;
  }

  const flattenedAuthors = [];
  let hasEqualOrder = false;
  for (const authorOrEqual of authors) {
    if (Array.isArray(authorOrEqual)) {
      hasEqualOrder = true;
      const equalAuthors = shuffle(authorOrEqual);
      for (const author of equalAuthors) {
        flattenedAuthors.push({ ...author, postSymbol: "*" });
      }
    } else {
      flattenedAuthors.push(authorOrEqual);
    }
  }

  return (
    <div
      style="margin-top: 1rem; font-family: var(--font-sans); font-size: 1rem;"
      class="authors"
    >
      {flattenedAuthors.slice(0, -1).map((author) => (
        <span>
          <Author {...author} />,{" "}
        </span>
      ))}
      <span>and </span>
      <Author {...flattenedAuthors.slice(-1)[0]} />
      {hasEqualOrder && (
        <span class="aside" style="color: #999">
          * equal contribution
        </span>
      )}
    </div>
  );
};

const Author = (props) => {
  const { link, name, postSymbol } = props;
  return (
    <span>
      <a href={link}>{name}</a>
      {postSymbol && <sup>{postSymbol}</sup>}
    </span>
  );
};
