---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
title: Simplifying the UI stack with local data
authors:
  -
    - name: Geoffrey Litt
      email: glitt@mit.edu
    - name: Nicholas Schiefer
      email: schiefer@mit.edu
  - name: Daniel Jackson
    email: dnj@csail.mit.edu
publishDate: 28 Feb 2022
draft: false
description:
---

Modern web applications are complicated to build and maintain because they have many layers of data representations spanning across the backend and frontend. For example, even a "simple" app might have:

- a relational database, queried with SQL
- an ORM mapping the relational database to in-memory objects, manipulated in a server-side language like Ruby or Node.JS
- A REST or GraphQL API describing this data in a serialized form, manipulated via HTTP requests
- Javascript objects in a rich client-side application, further manipulated in Javascript

![Draft image](../../../public/assets/blog/introduction/many-layers.png)

While each layer may be justifiable in isolation, the need to work across all these layers results in tremendous complexity. Adding a new feature to an app often requires writing code in many languages at many layers. Understanding the behavior of an entire system requires tracking down code and data dependencies across many process and network boundaries. To reason about performance, developers must carefully design caching and indexing strategies at every level of the stack. The result is that app development is a specialized, highly technical skill set: even many skilled programmers find it impossible to build simple user interfaces, and even advanced developers sometimes struggle to build performant, reliable apps.

How might we simplify this stack?

We think a promising direction is a [local-first](https://www.inkandswitch.com/local-first/) architecture, where all data is stored locally on the client, available to be freely read and modified at any time. When a network connection is available, changes are synchronized across clients, enabling collaborative applications including real-time collaboration when clients are online. This architecture benefits end-users by giving them more ownership and control over their own data, and allowing apps to remain usable when the network is spotty or nonexistent.

It might seem that a local-first architecture would make applications *more complicated* to build—after all, in a traditional cloud architecture, supporting offline mode is seen as a hard task that might involve adding client-side caching.
However, we think that the local-first architecture offers opportunities to make app development substantially simpler to build.
A large amount of effort in a traditional, cloud-oriented app is concerned with _managing state_: getting the data out of the database, making it available over APIs, and then orchestrating these API calls in just the right way.

Most client-side web UI technologies have been developed in a context where data is assumed to live far away on a server; now the data can be immediately close at hand on the client device. This feels like it could be huge _advantage_ for simplifying app development.
One early glimpse of this potential comes from general-purpose CRDT libraries like [Automerge](https://github.com/automerge/automerge) and [Yjs](https://github.com/yjs/yjs), which alleviate some of the complexity of building collaborative applications by providing a local, writable store and automatically managing synchronization between users, without the additional complexity of a rich backend.

Despite these promising developments, local-first apps are mostly written using the same tools and paradigms as standard cloud-based ones.
If an application developer can rely on the data being so  close at hand, might there be a simpler way to write apps?
Could we take more integrated approaches to computing with data that make it easier for developers to build, maintain, and debug their applications? Can we make apps more performant by default? Could apps become more customizable and composable by end users?

Changing from a traditional web stack to a local-first architecture could have profound implications throughout the entire UI development stack; in the Riffle project, we're interested in exploring these implications in the broadest sense.

Our approach is based on three observations.

First, we observe that a large part of the complexity of building an app comes from _managing and propogating state_; in some sense, state management is the main things that _makes an app an app_, an distinguishes app development from related tasks like data visualization.
Second, it seems that having a rich, local state at hand, as one does in the local-first architecture, might make state management radically easier.
If an application developer can rely on a powerful state management layer, then their UI code can just read and write local data, without worrying about synchronizing data, sending API requests, caching, or optimistically applying local updates. Writing an application that spans across devices and users could feel closer to simply writing a local-only app.

Third, reseachers and engineers have worked for nearly 50 years to design computer systems that specialize in managing state: databases!
The power of client-side databases is already well-known—many complex desktop and mobile apps (e.g. Adobe Lightroom, Apple Photos and Google Chrome) use the SQLite embedded relational database to manage data.
However, we think there are even greater opportunities to explore here—in particular, we see work on better query languages and fast incremental view maintenance as particular opportunities to apply ideas from database research to app development.

To start learning how these ideas might work in practice, we've built a prototype state management system: a reactive framework for SQLite, integrated with React.js to power apps running both in the browser and on the desktop using Tauri. Building apps using the prototype has already yielded some insight into the opportunities and challenges in this space.

## Hypotheses

Here are some of the specific ideas that we think could lead to powerful simplifications in building UIs.

### Declarative queries clarify application structure

Most applications have some canonical, normalized base state which must be further queried, denormalized, and reshaped before it can populate the user interface. For example, if a list of todos and projects is synced across clients, the UI may need to join across those collections and filter/group the data for display.

In traditional web applications, these data manipulations are spread across many different layers, including backend SQL queries, API calls, and client-side data manipulation. But in a local-first application, this doesn't need to be the case—all the queries can happen directly within the client. This raises the question: how should these queries be constructed and represented? For example, it would be possible to write imperative Javascript code to translate the base state into a UI, but this might not be the most ergonomic or performant approach.

We suspect that a good answer for many applications is to use a **relational model** to express queries within the client UI code. Declarative queries express intent more concisely than imperative code, and allow a query planner to design an efficient execution strategy without the application developer doing as much work. This is an uncontroversial stance in backend web development where SQL is commonplace; it's also a common approach in the many complex desktop apps that use SQLite as an embedded datastore (including Adobe Lightroom, Apple Photos, and Google Chrome). It's a less common approach to managing state in client-side web development, but we think it is a pattern that deserves to be more widely used. [cite Actual Budget, Datascript?]

aside: As we'll discuss throughout this piece, SQL as a specific instantiation of the relational model has some shortcomings. This has often led to adding layers around SQL, like ORMs and GraphQL. However, in principle, a sufficiently ergonomic replacement for SQL could eliminate the need for such additional layers.

### Fast reactive queries provide a clean mental model

A *reactive* system tracks dependencies between data and automatically keeps downstream data updated, so that the developer doesn't need to manually propagate change. This approach has been proven effective in many contexts—React has popularized this style in web UI development, and end-users have built complex reactive programs in spreadsheets for decades.

However, database queries are often not included in the core reactive loop. When a query to a backend database requires an expensive network request, it's impractical to keep a query constantly updated in real-time; instead, database reads and writes are modeled as *side effects* which must interact with the reactive system. Many applications only pull new data when the user makes an explicit request (e.g. reloading a page); doing real-time pushes usually requires carefully designing a manual approach to sending diffs between a server and client.

In a local-first architecture where queries are much cheaper to run, we can take a different approach. The developer can register _reactive queries_, where the system guarantees that they will be updated in response to changing data. Reactive queries can also depend on each other, and the system will decide on an efficient execution order and ensure data remains correctly updated.

One key observation about reactive systems is that making the reactive loop faster can qualitatively change the user experience. For example, a small spreadsheet typically updates instantaneously, meaning that the user never needs to worry about stale data; even a few seconds of delay when propagating a change can create a different experience. We think the goal of a data management system should be to converge all queries to their new result within a single animation frame (16ms) after a write; this means that the developer doesn't need to worry as much about temporarily inconsistent loading states, and the user gets fast software.

This performance budget may seem too ambitious, but there are reasons to believe it's achievable, especially if we use a relational model. The database community has spent considerable effort making it fast to execute relational queries; many SQLite queries complete in well under 1ms. Furthermore, re-running queries from scratch is the most naive way to achieve reactivity, but there's substantial research on incrementally maintaining relational queries (cite: Materialize, SQLive, Differential Datalog) which can dramatically reduce the overhead relative to re-running from scratch.

### Managing all state in one system provides greater flexibility

- traditionally, big split btwn ephemeral UI state / persistent DB state. Why is this...? DB is slow.
- Now DB is fast. Why not just combine it all?
- Sample reasons:
  - Reactive query system depends on UI state. Need to model it all in one system to make sense.
  - Allow inspecting all state in one debugger.
  - Allows easily persisting UI state.
  - new gen of collaborative tools: requirements are getting murkier. Share cursor, share hover?? Of course, still need checkboxes for shared/persisted! It's just that it should be a light checkbox, not an entirely different system.

## Our prototype system

- *Goal: prototype the experience of building an app in this style, learn about the problem*
- *important: this is not the final thing! and it's nowhere close to a product*
- Browser app: React + SQL.js + absurd-sql
- Tauri app: browser UI + Sqlite-native
- Our prototype: reactive graph around SQLite, + React hooks. Let's see by example.

In this section, we’ll concretely demonstrate our prototype system by showing how to use it to build a simplified iTunes-style music player. In the process, we’ll show how the relational, reactive, and universal approach to state makes it easier to develop an application that empowers the end user.

![Untitled](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/ae4eb571-6c53-401c-b6fd-a57457b9a866/Untitled.png)

### Schema

Our music collection is a very natural fit for a relational schema containing several normalized tables linked by foreign keys. Each track has an ID and name, and belongs to exactly one album:

**tracks**

| id | name | album_id |
| --- | --- | --- |
| 1 | If I Ain’t Got You | 11 |
| 2 | Started From the Bottom | 12 |
| 3 | Love Never Felt So Good | 13 |

**albums**

| id | name |
| --- | --- |
| 11 | The Diary of Alicia Keys |
| 12 | Nothing Was The Same |
| 13 | XSCAPE |

We also have artists in our database. A track can be associated with multiple artists through a join table, since artists can collaborate on a track:

**artists**

| id | name |
| --- | --- |
| 21 | Alicia Keys |
| 22 | Drake |
| 23 | Michael Jackson |
| 24 | Justin Timberlake |

**tracks_artists**

| track_id | artist_id |
| --- | --- |
| 1 | 21 |
| 2 | 22 |
| 3 | 23 |
| 3 | 24 |

Because Riffle is built around the SQLite embedded relational database, we can model these as familiar SQLite tables. Currently this is done using a very primitive schema definition in Javascript; a nicer approach to defining schemas and particularly migrations remains an open question.

Relational modeling takes a bit of practice to learn, and is sometimes considered more up-front work than modeling data in a more flexible document structure. However, many developers are already familiar with this skillset in the context of backend data modeling, and recently the relational model seems to be regaining favor as developers realize the benefits of normalized and structured data.

### Showing a list of tracks

In our app, we’d like to show a list view like this, where each track has a single row showing its album name and the names of its artists.

| Name | Album | Artists |
| --- | --- | --- |
| If I Ain’t Got You | The Diary of Alicia Keys | Alicia Keys |
| Started From the Bottom | Nothing Was The Same | Drake |
| Love Never Felt So Good | XSCAPE | Michael Jackson, Justin Timberlake |

Using SQL, it’s straightforward to load the name for each track, and to load the name of its album using a join:

```sql
select
  tracks.name as name,
  albums.name as album_name
from tracks
  left outer join albums on tracks.album_id = albums.id
```

We’ve already seen a key benefit of the relational model: SQL has made it natural to express joins across tables in a declarative way, without specifying a join algorithm. On the other hand, the syntax is verbose; in a language like GraphQL we could traverse this association more compactly:

```graphql
tracks {
	name
	albums {
		name
	}
}
```

Next, we need to add the third column: the list of artists for each track. We can do this within the SQL query by using a subquery which loads the artists for each track by joining through the `tracks_artists` table, and then applies a `group_concat` aggregation operator to concatenate the artist names together with commas:

```sql
select
  tracks.name as name,
  albums.name as album_name,

	-- subquery that concatenates artist names into a string
  (
    select group_concat(artists.name, ', ') from tracks_artists
    join artists on tracks_artists.artist_id = artists.id
    where tracks_artists.track_id = tracks.id
  ) as concatenated_artists
from tracks
  left outer join albums on tracks.album_id = albums.id
```

Doing this computation inside a SQL query might seem like it improperly mixes concerns between data reshaping and view templating. However, in Riffle the idea is to push all data manipulation down into relational queries as much as possible. As we’ll discuss more later, this has important implications for unifying data management and efficiently computing the view.

Once we’ve written this query, we’ve already done most of the work for showing this particular UI! We can simply extract the results and use a JSX template in a React component to render the data:

```jsx
const tracksQueryString = sql`
select
  tracks.name as name,
	...
from tracks
  left outer join albums on tracks.album_id = albums.id
`

// use hardcoded SQL string for our query
const tracksQuery = db.query(() => tracksQueryString)

const TrackList = () => {
	**// Subscribe to reactive query
	const tracks = useQuery(tracksQuery)**

	return <table>
		<thead>
			<th>Name></th>
			<th>Album></th>
			<th>Artists</th>
		</thead>
		<tbody>
			{tracks.map(track => <tr>
				<td>{track.name}</td>
				<td>{track.album_name}</td>
				<td>{track.concatenated_artists}</td>
			</tr>)}
		</tbody>
	</table>
}
```

*todo: screenshot of a list of tracks*

Importantly, this query doesn’t just execute once when the app boots. It’s a **reactive query**—any time the relevant contents of the database change, the query will automatically be re-run, and will notify this component that it needs to re-render. In this case, the query depends on the entire contents of the tracks, albums, and artists tables, so any changes to those tables should result in showing the user an updated table.

<aside>
💡 In fact, our prototype actually uses the most naive possible approach to reactivity: re-running all reactive queries any time the contents of the database change. This still turns out to be pretty fast in practice because our app doesn’t have many queries, and SQLite can run many common queries in under 1ms. In general, this is an instance of the problem of *incremental view maintenance [cite]* and we plan to explore far more efficient strategies for keeping these queries updated as the contents of the database change.

</aside>

Once the new results are ready, they’re passed on to the renderer. We currently use React for rendering, so it will use its usual strategy of rendering a new virtual DOM based on the new query results, and after diffing VDOMs, applying any necessary changes to the DOM.

### Sorting tracks

So far, our application looks pretty boring—our music collection doesn’t change very often, so it looks like it’s just rendering a static dataset. Let’s add some more interactive functionality by making the table sortable when the user clicks on the column headers.

The current sort property and direction represents a new piece of *state* that needs to be managed in our application. A typical solution in React might be to introduce some local component state, and then sort the list of tracks by that property in Javascript:

```jsx
import sortBy from 'lodash'

const TrackList = () => {
	const [sortProperty, setSortProperty] = useState("name")
	const tracks = useQuery(tracksQuery)
	const sortedTracks = sortBy(tracks, sortProperty)

	// ...
}
```

The idiomatic solution in Riffle looks quite different—because all UI state is managed in the database, we need to store the sort property state in the database. Riffle provides a mechanism for storing local state associated with UI components. Each type of component gets a relational table, with a schema that defines the local state for that component. Each row of the table is associated with a specific instance of the component, identified by a unique ID called the *component key.*

How are component instance IDs chosen? An app developer can choose from several strategies:

- **Ephemeral**: every time React mounts a new component instance, generate a fresh random ID. This replicates the familiar behavior of React’s local state. Once a component unmounts, we can safely garbage collect its state from the table.
- **Singleton:** always assign the same ID to every instance, so that the table only has one row. All instances of the component will share state.
- **Custom**: The developer can choose a custom key as a middle ground between these two approaches. For example, a track list might be identified by the playlist it’s displaying. Then, a user could toggle back and forth between viewing two different track lists, while preserving the sort state within each list separately.

In our example scenario, our app is simple enough so far that we only need to manage state for a single global track list; we can use the singleton strategy and keep the table limited to a single row. The table will look like this:

**component__TrackList**

| id | sortProperty | sortDirection |
| --- | --- | --- |
| SINGLETON | name | asc |

In our code, we can use the `useComponentState` hook to access getter and setter functions to manipulate the state, which feels fairly similar to React. However, under the hood, this is implemented in terms of simple database queries. The getters are simply reactive queries that incorporate the key for this component instance; the setters are syntax sugar for update statements which also incorporate the component key.

```jsx
import Singleton from '../component'

const TrackListSchema = {
  componentType: "TrackList",
  columns: {
    sortProperty: "string",
    sortDirection: "string"
  }
}

const TrackList = () => {
	**const [state, set] = useComponentState(TrackListSchema, { key: Singleton })**
	const tracks = useQuery(tracksQuery)

	return <table>
		<thead>
			**<th onClick={set.sortProperty("name")}>Name></th>
			<th onClick={set.sortProperty("album_name")}>Album></th>
			<th onClick={set.sortProperty("artists")}>Artists</th>**
		</thead>
	...
}
```

Next, we need to actually use this state in our query. We can use string interpolation to dynamically change the query depending on the sorting state:

```jsx
// Define SQL query for tracks list
const tracksQuery = db.query(() => sql`
select
  tracks.name as name,
	...
from tracks
  left outer join albums on tracks.album_id = albums.id
**order by ${state.sortProperty()} ${state.sortOrder()}**
`)
```

This establishes a new reactive dependency. Up until now, the query string was hardcoded, and it would only reactively update when the database contents changed. Now, the query string itself depends on the local component state. Riffle’s reactivity system ensures that queries run in a correct dependency order—if the sort property changes, the query for that property must run before its result can be used in the tracks query.

![IMG_0551.jpg](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/ef54c6f9-90e1-43c5-bfab-81cf1ac9d7f8/IMG_0551.jpg)

<aside>
💡 By using function calls to access dependent state within query strings, we can automatically track dependencies between queries using a global stack; this is a trick used by SolidJS, Adapton, and other reactive systems.

</aside>

Now when we click the table headers, we see the table reactively update!

*Video: show table headers sorting*

What have we gained by taking the Riffle approach here?

- We have structured dataflow ****that makes it easier to **understand the provenance** of computations. If we want to know why the tracks are showing up the way they are, we can inspect a query, and transitively inspect that query’s dependencies, just like in a spreadsheet.
    - *todo: debugger screenshot / demo*
- We can achieve more **efficient execution** by pushing computations down into a database. For example, we can maintain indexes in a database to avoid the need to sort data in our application or manually maintain ad hoc indexes in our app code.
- UI state is **persistent by default**. It’s often convenient for end-users to have state like sort order or scroll position persisted, but it takes active work for app developers to add these kinds of features. In Riffle, persistence comes for free, although local and ephemeral state are still easily achievable by setting up component keys accordingly.

This last benefit points to the deeper principle of *universal* state management. By handling “app state” and “UI state” in a single tool, we can avoid drawing a strong distinction between the two categories. For example, some realtime collaborative apps break the traditional assumption that UI state is device-local by sharing things like cursor position or menu state across clients. We believe sharing UI state should be a simple matter of changing some settings on a state object, not migrating state to a totally different data management system.

### Search

Next, let’s add a search box where the user can type to filter the list of tracks by track, album, or artist name. We can add the current search term as a new column in the track list’s component state:

**component__TrackList**

| id | sortProperty | sortDirection | searchTerm |
| --- | --- | --- | --- |
| SINGLETON | name | asc | Timberlake |

```jsx
<input
	type="text"
	value={state.searchTerm}
	onChange={(e) => set.searchTerm(e.target.value)} />
```

We can then connect an input element to this new piece of state in the database. We use a standard React *controlled input*, which treats the input element as a stateless view of our app state rather than an inherently stateful DOM element.

Next, we need to wire up the search box to actually filter the list of tracks. SQLite has an [extension](https://www.sqlite.org/fts5.html) that we can use to create a full text index over our tracks table; we’ll call our index `tracks_full_text`. Then we can rewrite our query to use this index to filter the query based on the current search term in the search box:

```jsx
const filteredTracks = db.query(() => {
	let query = sql`select * from tracks_full_text`

	// If search term is present, filter using full text index
	if(state.searchTerm() !== "") {
		query = sql`${query} where tracks_full_text match "${state.searchTerm()}*"`
	}
	return query
})
```

Revisiting our graph of dependent queries, there’s now a new layer:

![IMG_0550.jpg](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/2c6d40f2-21a0-4de3-b12b-734e2bb8d1b7/IMG_0550.jpg)

Now, when the user types into the search box, their search term appears and filters the list of tracks:

*video figure: searching tracks*

Interestingly, because we’re using a controlled component, every keystroke the user types must round trip through the Riffle database before it is shown on the screen, which imposes tight constraints on database latency: ideally we want to finish updating the input and all its downstream dependencies within a few milliseconds.

It may seem unusual to send user input through the database before showing it on the screen, but there’s a major advantage to this approach. If we can consistently achieve this performance budget and refresh our reactive queries *synchronously*, the application becomes much easier to reason about, because it always shows a single consistent state at any point in time. For example, we don’t need to worry about handling the case where the input text has changed but the rest of the application hasn’t reacted yet.

Because all the data is available on the local client without network latency in our architecture, the theoretical ceiling on performance is high. We can also tune the database so that it doesn’t need to persist to disk before confirming a write, which is a reasonable level of durability in this context. In our experience so far, SQLite can run many queries fast enough to make this approach work, although we still need to develop more asynchronous approaches for handling slow queries.

### Virtualized list rendering

![CleanShot 2022-02-15 at 16.55.34@2x.png](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/3e9ec289-dbf3-4c3b-ba6c-02736128a91c/CleanShot_2022-02-15_at_16.55.342x.png)

Personal music collections can get large—it’s not uncommon for one person to collect hundreds of thousands of songs over time. With a large collection, it’s too slow to render all the rows of the list to the DOM, so we need to use *virtualized* list rendering: only putting the actually visible rows into the DOM, with some buffer above and below. With Riffle, implementing a simple virtualized list view from scratch only takes a few lines of code.

We start by representing the current scroll position in the list as a new state column on the track list component, `scrollIndex`. As the user scrolls, we use an event handler on the DOM to update this value, essentially mirroring the stateful scroll position of the DOM into the database. We also throttle updates to happen at most once every 50ms to avoid overwhelming the database with writes during rapid scrolling.

```jsx
import { throttle } from 'lodash'

const handleScrollTopChanged =
  throttle(scrollTop => {
    const scrollIndex = Math.floor(scrollTop / TRACK_HEIGHT)
    set.scrollIndex(scrollIndex)
  }, 50)

//...

<div onScrollCapture={e => handleScrollTopChanged(e.target.scrollTop)}>
	{// ... track list contents}
</div>
```

Then, we can write a reactive database query that uses this scroll index state and only returns the rows around the currently visible window, using a SQL `limit` and `offset` . We can then do a little more math to position those rows the appropriate distance from the top of the container.

```jsx
const PAGE_SIZE = 40 // size of one page in the UI
const PAGE_BUFFER = 100 // extra rows to load on either side

const filteredPagedTracks = db.query(() => {
  const startIx = parseInt(state.scrollIndex()) - PAGE_BUFFER
  return sql`
    select * from ${filteredTracks} as tracks
    limit ${PAGE_SIZE + (2 * PAGE_BUFFER)} offset ${startIx}
  `
},
```

This introduces yet another layer to our reactive query graph. Once again, by explicitly representing all these dependencies in Riffle, we gain two key advantages:

- The runtime can efficiently schedule incremental updates through the graph.
- The user can inspect and understand the structure of the computation.

![IMG_0549.jpg](https://s3-us-west-2.amazonaws.com/secure.notion-static.com/e9aaf1be-36a9-49e6-b3de-2369f7c5e1fb/IMG_0549.jpg)

This simple approach to virtualized list rendering turns out to be fast enough to support rapid scrolling over a collection of 250k+ tracks. Because all the data is available locally and we can query it quickly, we don’t need to reason about manual caches or downloading paginated batches of data; we can simply declaratively query for the data we want given the current state of the view. The local-first architecture has enabled a much simpler approach.

### Interoperability through data-centric APIs

*todo*

Fun demo: TablePlus changing seach term / sort order

play state demo

API as noun not verb

briefly mention Spotify daemon

## Limitations of the prototype

Many things we haven’t had time for yet...

- sync! future project.
- access control, partial data views on client
- Many incidental perf challenges: SQLite’s limited planner, React rendering, browser event loop
- migrations are a fundamental challenge

## Findings

We see our work with our prototype as an exploratory experiments to understand our design principles in a serious context. As we iterated on our prototype, we came to some interesting conclusions.

### Declarative queries make data dependencies clear.

A lot of the complexity of app development comes from managing data dependencies: when something happens, we need to update all of the relevant pieces of the app right away. Traditionally, an app would have a bunch of imperative code in between an action and all of its dependencies. In contrast, our prototype makes most of these dependencies declarative, which makes it much easier to get a birds-eye view of how data moves within the application.

This became especially clear as we built our prototype debugger. If our core application logic was written in Javascript, we could debug our code in an imperative, line-by-line style, but this obscures what’s actually going on. Since our data flow is expressed declaratively, we can just view the data *as they are transformed by the query.*

- [ ]  Should we say something about how this is frame-wise rather than row-wise like a for loop? Feel profound but I don’t know how to say it.

### Good relational modeling decouples read and write access patterns.

Commonly, frontend web apps represent the data as a complex structured object: in the best case, these objects can be serialized as JSON, but in general they can be arbitrary object graphs within the VM. These object graphs are in many ways richer than simple relations.

However, an object-graph data model generally couples the read- and write- access paths together. For example, a developer might build their main data store as a JSON list, with lookup by index (roughly a primary key), since this is convenient for writes. However, allowing quick lookup by another attribute, like a user name, requires either a rewrite of the data model or hand-rolled index logic.

In contrast, relations are abstract objects with no particular physical semantics. The application developer can model the data conceptually, and it is up to the database to find an efficient way to implement the read and write access patterns of the application. Even a very simple database like SQLite offers a rich suite of tools, like indexes, to respond to those access patterns. Crucially, those tools are largely decoupled from the data model itself, and can even be modified without changing the queries.

### Pervasive reactivity has super-linear benefits.

A standard web application might have several components that are reactive in one way or another: for example, frontend web frameworks like React and Svelte offer a reactive way to manage the DOM. However, those reactive pieces are generally interspersed with non-reactive components like REST APIs.

We have found that reactivity has super-linear benefits: when non-reactive parts of the stack are removed, we see dramatic conceptual simplifications. We would like to lean even further to this, and see how much of a full application can be expressed in an end-to-end reactive framework.

- [ ]  Be more specific

### Data-based interoperability can be much better than action-based APIs.

Since the introduction of object-oriented programming, most interoperability has been “verb-based”: that is, based on having programs call into each other using APIs. Indeed, new programmers are often taught to hide data behind APIs as much as possible in order to encapsulate state.

In our prototype, we found dramatic benefits to turning this paradigm on its head. Instead of using verb-based APIs for interoperability, we used *shared data representations* to create “noun-based” interoperability surfaces. We observed three major advantages to this approach.

First, we found it very decouple read- and write-paths: the source application can write the data in a convenient format, while the target application can query it to obtain data in a different convenient format. Often, the most convenient write path is an event log, but consuming an event log is quite difficult for other apps.

Second, verb-based APIs create an unfortunate n-to-n problem: every app needs to know how to call the APIs of every other app. In contrast, data-based interoperability can use the shared data directly: once an app knows how to read a data format, it can read that data regardless of which app produced it.

Third, we found that treating the data format as a core interface for an app solves many problems that are plague modern apps. Many users who are familiar with standard UNIX tools and conventions speak wistfully of “plain text” data formats, despite its disadvantages. We feel that plain text is an unfortunate way to store data in general, but recognize what these users long for: a source of truth that is *legible* outside of the application, possibly in ways that the application developer never anticipated. As we saw in our TablePlus demo, data-based interoperability provides these advantages while also providing the advantages of a structured file format.

- [x]  A brief rant about “plain-text” data formats
- [ ]  Link to Andy’s tweet about n-to-n problems in APIs?

### The difference between “UI data” and “domain data” is quantitative, not qualitative.

Traditional applications, especially web apps, tend to draw a sharp distinction between non-persistent “UI data” and persistent “domain data”: the former are ephemeral and stored only in the browser’s VM, while the latter are persisted to a backend database. Shifting a piece of state from one to the other requires largely re-architecting the application: for example, very few applications preserve scroll state the way that apps like Twitter do.

Our experiments suggest that this difference is actually quite fluid: it is easy for some data to start out as something ephemeral and slowly accumulate importance over time. We found it quite nice to treat all data, whether ephemeral or persistent, in a uniform way, and think of persistence as a lightweight property of that data, rather than a foundational part of the data model. While we didn’t tackle multi-device synchronization in this project, we see sync the same way: it’s more like a checkbox on a piece of state than a key modeling concern.

### SQL is powerful and familiar, not a good language all types of data.

We were initially very enthusiastic about unlocking the power of SQL in a web app. We found a lot to like in SQL: the relational model provides a lot of advantages, query optimizers are very powerful, and a large number of people, including many who aren’t “software developers” can understand and even write it.

Nonetheless, SQL was a consistent thorn in our side during this project. The deficiencies of SQL are [well-known](https://www.scattered-thoughts.net/writing/against-sql), so we won’t belabour them here. A few key pain points were:

1. Standard SQL doesn’t support nesting, even in the projection step (i.e., what describes the shape of the results). We’re big fans of data normalization, but it’s very convenient to nest data when producing outputs.

    There are various extensions to SQL that support nesting, but many of them are not that good and the good ones are not widely available.

2. SQL syntax is verbose and non-uniform. SQL makes the hard things possible, but the simple things aren’t easy. Often, making small changes to the query requires rewriting it completely. In our prototype, we ended up adding a small GraphQL layer on top of SQL for ergonomic reasons
3. SQL’s scalar expression language is weird and limited. Often, we wanted to factor out a scalar expression for re-use, but doing this in SQLite was annoying enough that we didn’t do it often.

We view these issues as shortcomings of *SQL in particular*, and not the idea of a relational query language in general. However, we think that SQL is mostly not a good fit for a general relational language for building apps.

- [ ]  Talk about the alternative history?
- **The structure of reactive declarative queries makes it easier to understand a system**
    - structured model enables a clean debugging experience like a spreadsheet
    - Synchronous update model is nice to reason about. But:
        - perf is a big question. SQLite is often pretty fast but not always. And working in the browser async loop + with React rendering introduces further challenges.
        - There are tricky cases it doesn’t handle: long-running async network requests, animations between states. Similar to the challenges that React.js has to deal w/.
- **Viewing/editing data in a generic DB tool is very convenient for debugging.**
    - really nice to just see/edit the UI state.
    - Also points towards interoperability/scripting.
- **SQL is great in some ways, very limited in others.**
    - SQL is powerful! Relational model is great. If you already know SQL, it’s nice and familiar.
    - But SQL has major drawbacks:
        - No nested results, huge problem for UIs
        - verbose syntax
        - weird scalar language
    - Our meta-query language is currently SQL + string interpolation, which is clearly terrible. Very easy to get wrong, sometimes hard to read.
    - Also mention we’ve tried some GraphQL experiments...
- **Persistent UI state by default is a nice bonus.**
- *todo: fill out more findings*

## Towards a reactive, relational approach to state management

Our early investigations suggest that a local-first, data-centric architecture radically simplifies some parts of app development.
We also know that it is at least somewhat practical: we've managed to build a real app that works with moderate amounts of data and has good performance.
These experiments make us particularly excited about the transferability of insights and technologies from the database reserach community to the domain of app development.

### Component trees a queries

This version or Riffle was built on top of React, but while React components are (special) functions, a Riffle component is much more highly structured.
Conceptually, a component is a combination of some queries that implement the data transformations, a JSX template for rendering that component to the DOM, and a set of event handlers for responding to user actions.

[TK insert picture]

In some sense, the template is also a "query": it's a pure function of the data returned by the queries, and its expressed in a declarative, rather than imperative style!
So, we could view the queries and template together as a large, tree-structured view of the data.

We can extend this perspective even further: each component takes some arguments (props, in React parlance), which might themselves be queries, but are also a pure function of the data.
We can therefore see the entire component tree in the same way: it's one giant query that defines a particular view of the data.
This view is precisely analgous to the concept of a "view" in SQL database, except that instead of containing tabular data, it is a tree of DOM nodes.

This perspective is a nice lens for understanding how Riffle works, but we have found that it is not an especially useful one when actually building an app in our prototype framework.
For now, our tools feel mostly like a set of unusual extensions to React, in large part because of the awkwardness of switching between SQL and JavaScript, neither of which is a compelling langauge for expressing these kinds of declarative, tree-structured queries.

### Taking "everything is a query" even further

Many modern app development frameworks adopt a sort of circular data flow: the UI is rendered as a pure function of some underlying state, and when the user performs some actions those trigger events, which cause cascading changes in the state and therefore the UI.
Traditionally, there's a lot of work to propogate that change all the way through:
1. Some kind of event manager needs to validate the event ("was it really safe to delete that playlist?") and apply it to the data.
In a traditional web app, the event manager is the backend, but in a local-first architecture this is commonly done by a CRDT library such as Automerge.
2. The app's business logic updates various pieces of derived state: for example, a playlist deletion would need to update the playlists shown in the sidebar, and possibly also update some metadata on the songs that were in that playlist.
This would traditionally be done in either the model and controller of a Rails-style app, or in perhaps in imperative Javascript.
3. The frontend needs to update the actual UI elements---and ultimately the pixels shown on the screen---in response to the changes in the business logic.
In our example, we might need to switch back to some home screen if the deleted playlist was selected by the user.
In many modern apps, this is done using a frontend framework like React or Svelte.

[TK insert diagram]

In this light, our prototype explored the extent to which we could replace the second step with reactive queries.
If we take the perspective that an entire component tree is a query, we could say that these reactive queries extend into the third step, as well, although that third step is managed for us by React.

One could imagine pushing this "everything is a query" persepctive even further, though.
Instead of viewing the entire app as a relational view that represents a tree of DOM nodes, we could imagine replacing the DOM entirely and have Riffle represent the _pixels on the screen_ as the results of a single large query.
We could also extend the stack in the other direction by treating the application of events in an event log into readable data as a query as well, as in Martin Kleppmann's implementation of a text CRDT using Datalog.

Taken to the extreme, we end up with a minimal model of an interactive app, where users take actions that are recorded in an event log, and then those actions cause changes in a UI described entirely by a declarative query.

### What might compressing the stack into a query get us?

While this is clean and elegant concept, there's a natural question of whether it actually leads to any progress in our quest to make app development simpler, faster, and more powerful.
There are some benefits from _stack compression_, where what were previously a set of disparate technologies--event handling, data querying, and UI rendering--can be represented in a uniform way.
However, we think that the primary benefit of this uniformity comes from the ability to more easily _reason across the layers of the stack_.

For example, let's consider performance.
User-facing apps face performance challenges that don't show up in other types of programs, especially when it comes to _latency_. Users are [exquisitely sensitive](TK link) to even small amounts of latency, and we believe that low latency is a key property of the types of creative tools that we're excited about.
A key challenge in building performant apps is performing _incremental updates_: it's often much easier to describe how to build the UI from scratch than to figure out how it must update in response to a new event, but it's often too expensive to rebuild the UI from scratch every frame as in immediate-mode GUI tools.
Indeed, a key lesson from React and other virtual DOM-based tools is finding a way to automatically transform a build-from-scratch description of the UI into an incremental one.

In the past twenty years, researchers in the programming languages and database communities have developed various tools for automatically incrementalizing computation.
Many of these techniques are attempts to solve the _incremental view maintenance_ problem for relational databases, where a view of the data is dynamically maintained as new writes occur.

If the UI can be expressed in a way that is friendly to one of these automated incremental maintenance, perhaps as a declarative view of the data, we might be able to express user interfaces in a declarative, build-from-scratch way but obtain the perfromance benefits of incremental updates.

While this seems like a purely technical benefit, we also believe that there are conceptual advantages to uniformity in the user interface stack.
Many systems for incremental maintenance work by tracking data _provnenance_: they remember where a particular computation got its inputs, so that it knows when that computation needs to be re-run.
We believe that understanding data provenance is also a fundamental tool in understanding app behaviour, for both app developers trying to debug the app and end users who are trying to extend it.

Imagine a browser-style developer console that allows you to click on a UI element and see what component it was generated from. In a system with end-to-end provenance, we could identify how this element came to be in a much deeper way, answering questions not just questions like "what component template generated this element?" but "what query results caused that component to be included?" and even "what event caused those query results to look this way?".
We saw an early example of this in our query debugger view, but we believe that this can be taken much further. In many ways, data provenance tracking seems like a key step towards fulfilling the vision of [Whyline](TK link), where any piece of an app can be inspected to determine _why_ it's in that state.

### Where we're going

We started this project wondering how the local-first availability of an app's data could change and simplify app development.
At this point, we're left with more questions than answers.
However, we see the outline of an appraoch where _user interfaces are expressed as queries_, those queries are executed by a fast, performant incremental maintenance system, and that incremental maintenance gives us _detailed data provnenace_ throughout the system.
Together, those ideas seem like they could make app development radically simpler and more accessible, possibly so simple that it could be done "at the speed of thought" by users who aren't skilled in app development.
We're excited by this potential, and even more excited by the possiblity that we might already have the basic technological pieces to make that vision a reality.

If you'd like to follow our work, consider subscribing for udpates:
We'd love your feedback: we're on Twitter and email.

## Related Work

How is this different from?

There is a rich, emerging landscape of tools that help app developers manage state. Here’s how we see Riffle in this landscape, using loose clusters and non-exhaustive lists of prior work:

### Local-first CRDT-based state managers

There is an emerging class of CRDT-based state management tools for building local-first software, including Automerge and Yjs. These expose a data structure with general-purpose semantics that handles the complexity of distributed, real-time sync. This has also been exposed in real-world applications, including Actual Budget, which implements CRDT-style sync between SQLite databases.

Because of the amount of excellent prior work in this space, we have deliberately ignored the question of sync for now. In the short term, we imagine adding sync to our databases using OR-set semantics [CITE], in the style of James Long’s implementation for Actual Budget.

While we share the goal of promoting powerful, local-first software, Riffle is designed to be less of a drop-in persistent state management tool and more of a totalizing, end-to-end manager for all application state. In particular, the reactive relational queries at the heart of Riffle lie outside of the domain of concern for CRDT libraries. This more structured approach to app development allows unique features like our data-centric debugging UI.

- **Local-first CRDT-based state managers**
    - Actual Budget, Automerge / Yjs, Braid
    - lots of shared goals
    - We’re focussed on deriving things from data, not how the data are stored
    - difference: more focus on queries, data constraints, debugging UI itself

### Cloud-based full-stack reactivity

@Geoffrey Litt to write, I don’t know anything about this space.

- **Cloud Full-stack reactivity**
    - Meteor
    - Firebase


### Relational end-user programming tools

We find a lot of inspiration in tools like Airtable, which draw from the relational model to create powerful tools targeted at end users. Airtable is a highly productive tool for building lightweight, reactive, data-centric apps, even for skilled software developers. Airtable also contains a remarkable set of “escape hatches” that allow programmers to build embedded React apps within the Airtable UI.
Nonetheless, Airtable has some significant limitations: its query facilities are limited by what can be expressed in its view UI, and it doesn't come close to expressing the full power of relational queries: it doesn't support general joins, or even nested and/or predicates.
It also has some notable technical limitations, like the 50,000 record-per-base limit, that prevent it from handling even modest amounts of data.

Riffle attacks the problem from a different direction: instead of aiming at extremely simple use cases, it starts by trying to express the full power of a relational model to experienced developers.
We hope that these new abstractions can build a solid foundation on which higher-level tools can be built for end-users.

Put another way: you can’t use Airtable to write iTunes, but we’ve been able to use Riffle to make myTunes.

### Relational tree languages

There are several other attempts at extending the relational model to produce tree-structured results like a DOM.
Most notably, Jamie Brandon's [Imp](TK link) project constitutes several takes on relational langauges for definin UIs.
Our project is highly aligned iwth the vision of Imp; the biggest difference is that we have been less willing to throw away existing tools entirely and more eager to make use them, in order to get feedback from real use cases, like myTunes.get feedback from real use cases, like myTunes.get feedback from real use cases, like myTunes.get feedback from real use cases, like myTunes.

    - GraphQL

### Reactive UI state frameworks

- Reactive state management for React.js: Recoil, Jotai
- Alternate frameworks: SolidJS, Svelte
- Spreadsheets
- Jane St Incremental + incr-dom
- Incremental computation, including incremental SQL
    - Jane St Incremental
    - Incremental view maintenance systems
    - Differential Dataflow + Materialize
    - Differential Datalog
    - Noria (MIT project)
    - SQLive

## meta notes / open questions

- give more precise perf numbers?
- run the demo live in the page?
- where to mention that myTunes is a real project?
- potential feedback givers:
    - johannes
    - pvh
    - martin
    - james long