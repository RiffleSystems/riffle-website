---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
title: Reactive Relational UI State Management
publishDate: 28 Feb 2022
draft: false
description:
---

Modern cloud applications are becoming increasingly complicated to build. To provide a good user experience in 2022, developers must grapple with data across many different layers: often a backend database, an ORM, a backend web server, a REST or GraphQL API, and multiple derived datasets within a rich frontend, all with their own differing data models. This wastes time for developers and makes it harder to iterate on software.

At the same time, the cloud architecture leaves much to be desired for end users. Data is locked away in cloud silos, only accessible to sip out through tightly controlled APIs, which makes it harder for users to compose tools together and customize their software. Cloud applications are often highly reliant on network availability, making them slow and unreliable. It is possible for developers to address these problems, but only by investing lots of effort to fight against the natural grain of the architecture.

How can we make software easier to build for developers, and better to use for end users? One promising solution is *local-first software* [cite], which locates data and application logic on end user devices rather than in a cloud server. Data can still be synchronized when a network is available, but the application is no longer fundamentally reliant on a backend server for its core functionality. The local-first architecture can help developers by eliminating layers of the stack, making it simpler to develop and deploy applications. It can also help users by giving them faster, more composable tools, and easier access to their own data.

Building a local-first application introduces many tricky challenges related to data management. So far, much effort has been focused on the important problem of merging concurrent changes, particularly using CRDTs. But we believe that there is a broader question which has not yet been fully explored: **if we assume a local-first architecture, how might this enable us to radically simplify the way that user interfaces are constructed?**

Our approach is to build on three ideas, taking each to an extreme:

***Relational**:* Build around a relational data model and query language. This provides a flexible structured foundation for data modeling, even across application boundaries.

***Reactive**:* Tracking dependencies and automatically updating downstream state is a proven idea in systems ranging from spreadsheets to React.js. By building around a carefully structured reactivity model, we can make a user interface much easier to reason about for users and for developers.

***Universal**:* Blur the boundary between “app state” and “UI state”, managing both in one system. This enables thinking more flexibly about the role of different bits of state, e.g. making it easy to share or persist data.

In this essay we describe an early prototype of Riffle, a state management system based on these ideas. The prototype uses SQLite as a storage and query engine, and React.js as a rendering layer, targeting both in-browser apps as well as a desktop app using Tauri. Riffle is far from complete, but we hope that sharing our initial learnings might provide some value.

We share some concrete examples of building software using Riffle, and demonstrate some of the powerful capabilities suggested by the approach. We also share some of the challenges we have encountered, some of which are incidental engineering problems, but some of which point to deeper research challenges.

## Architecture comparison

diff against a normal architecture

- Unified:
    - all state in one thing
    - sharing, persistence: Just checkboxes
    - flexible scripting, full benefits of “data as API”
- Reactive
    - easy, a la React
    - deep reactive:
        - provenance, visible structure
        - speed
- Relational
    - normal benefits in backend: structured schema, normalized data nice for integrity
    - extra benefits in this scenario: flexible schema ⇒ interop
    - some drawbacks

## Example Scenario

In this section, we’ll concretely demonstrate the Riffle model by showing how to use it to build a simplified iTunes-style music player. In the process, we’ll show how the relational, reactive, and universal approach to state makes it easier to develop an application that empowers the end user.

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

## Related Work

How is this different from?

There is a rich, emerging landscape of tools that help app developers manage state. Here’s how we see Riffle in this landscape, using loose clusters and non-exhaustive lists of prior work:

### Local-first CRDT-based state managers

There is an emerging class of CRDT-based state management tools for building local-first software, including Automerge and Yjs. These expose a data structure with general-purpose semantics that handles the complexity of distributed, real-time sync. This has also been exposed in real-world applications, including Actual Budget, which implements CRDT-style sync between SQLite databases.

Because of the amount of excellent prior work in this space, we have deliberately ignored the question of sync for now. In the short term, we imagine adding sync to our databases using OR-set semantics [CITE], in the style of James Long’s implementation for Actual Budget.

While we share the goal of promoting powerful, local-first software, Riffle is designed to be less of a drop-in persistent state management tool and more of a totalizing, end-to-end manager for all application state. In particular, the reactive relational queries at the heart of Riffle lie outside of the domain of concern for CRDT libraries. This more structured approach to app development allows unique features like our data-centric debugging UI.

- **Local-first CRDT-based state managers**
    - Actual Budget, Automerge / Yjs, etc
    - lots of shared goals
    - We’re focussed on deriving things from data, not how the data are stored
    - difference: more focus on queries, data constraints, debugging UI itself

### Cloud-based full-stack reactivity

@Geoffrey Litt to write, I don’t know anything about this space.

- **Cloud Full-stack reactivity**
    - Meteor
    - Firebase


### Relational end-user programming tools

We find a lot of inspiration in tools like Airtable, which draw from the relational model to create extremely powerful tools targeted at end users. Airtable is a remarkably productive tool for building lightweight, reactive, data-centric apps, even for skilled software developers. Airtable also contains a remarkable set of “escape hatches” that allow programmers to build embedded React apps within the Airtable UI.

Unlike Airtable, Riffle aims to add powerful new abstractions to the toolkit of sophisticated developers, in addition to serving novices and end-users. We are concerned with exposing the full power of the relational query model, and want to avoid technical limitations such as Airtable’s 50,000 record-per-base limit.

Put another way: you can’t use Airtable to write iTunes, but we’ve been able to use Riffle to make myTunes.

### Relational tree languages

- Relationally constructing UI trees
    - Imp
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