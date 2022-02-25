import { shuffle } from 'lodash'
import { h } from 'preact'

export const AuthorList = props => {
    const { authors } = props;

    const flattenedAuthors = [];
    let hasEqualOrder = false;
    for (const authorOrEqual of authors) {
        if (Array.isArray(authorOrEqual)) {
            hasEqualOrder = true;
            const equalAuthors = shuffle(authorOrEqual);
            for (const author of equalAuthors) {
                flattenedAuthors.push({... author, postSymbol: "*"});
            }
        } else {
            flattenedAuthors.push(authorOrEqual);
        }
    }

    
    return (
        <div style="margin-top: 1rem" class="authors">
            {hasEqualOrder && (<aside style="color: #999">* equal contribution</aside>)}
            {flattenedAuthors.slice(0, -1).map(author => <span><Author {...author} />, </span>)}
            <span>and </span>
            <Author {...flattenedAuthors.slice(-1)[0]} />
        </div>
    )
}

const Author = props => {
    const { email, name, postSymbol } = props;
    return (
    <span>
        <a href={"mailto:" + email}>{name}</a>{postSymbol && <sup>{postSymbol}</sup>}
    </span>
    )
}