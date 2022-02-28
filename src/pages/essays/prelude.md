---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
  import SubscriptionBox from '../../components/SubscriptionBox.astro'
  import Abstract from '../../components/Abstract.astro'
  import { Markdown } from "astro/components";
title: Building data-centric apps with a reactive relational database
authors:
  -
    - name: Geoffrey Litt
      email: glitt@mit.edu
    - name: Nicholas Schiefer
      email: schiefer@mit.edu
  - name: Johannes Schickling
    email:
  - name: Daniel Jackson
    email: dnj@csail.mit.edu
publishDate: 28 Feb 2022
draft: false
description:
---

<div style="color: red; font-weight: bold;">This is a private draft, please don't share widely. Thanks for reading!</div>

<Abstract>
  <p>The Riffle project aims to rethink app development in order to make it simpler for developers to create good software, and to enable more people to build and customize their own apps.</p>

  <p>In this essay, we present an initial overview of our approach. Our key idea is to use a local-first architecture where data is located on the client, in order to support new UI development patterns. We propose managing all application and UI state in a local <em>reactive relational</em> database, which provides a clearly structured model for reasoning about dataflow.</p>

  <p>As an early prototype, we've built a reactive query layer over SQLite, integrated with React for rendering. We describe what we've learned so far from using this prototype, and sketch a path towards a simpler paradigm for building stateful apps.</p>
</Abstract>

## Introduction

Today, building interactive apps is hard: so hard that it's a specialized skill even among software developers.
Skilled technical computer users, including scientists and systems programmers, struggle to make simple apps, while less technical end-users are [disepowered](https://www.geoffreylitt.com/2019/07/29/browser-extensions.html) entirely.
Like [many](https://www.inkandswitch.com/end-user-programming/), [other](http://worrydream.com/ClimateChange/), [researchers](https://mavo.io/), we'd like to fix this by making app development radically more accessible to experts and novices alike.

<aside>

Here's an interesting thought experiment.
Many software developers think that it is much easier to build command line tools than GUI apps, or even text-user interface (TUI) apps.
Why is that?

One answer is that command line tools tend to be _stateless_ in between user commands.
A user gives the program some instructions, and it executes them, then discards all of the hidden state before returning control to the user.
In contrast, most apps have some kind of persistent state--often quite a lot--that needs to be maintained and updated as the user takes actions.

</aside>

Our key hypothesis is app development is hard in large part because **managing state is hard**.
Especially in data-centric apps, a large part of the complexity of building and modifying the app comes from managing and propogating state.
In some sense, state management is the main thing that _makes an app an app_, and distinguishes app development from related tasks like data visualization.
In a traditional desktop app, state is usually split between app's main memory and various external stores, like filesystems and embededded databases.

In a web app, the situation is even worse: the app developer has to thread the state through from the backend database to the frontend and back.
Web apps have many redundant data representations spanning across the backend and frontend: for example, a "simple" app might use a relational database queried via SQL, an ORM on a backend server, a REST API used via HTTP requests, and objects in a rich client-side application, further manipulated in Javascript.

![](/assets/blog/prelude/layers.png)

While each layer may be justifiable in isolation, the need to work across all these layers results in tremendous complexity. Adding a new feature to an app often requires writing code in many languages at many layers. Understanding the behavior of an entire system requires tracking down code and data dependencies across process and network boundaries. To reason about performance, developers must carefully design caching and indexing strategies at every level of the stack. Even advanced developers invest enormous effort to create performant, reliable apps.

We think that a [local-first](https://www.inkandswitch.com/local-first/) architecture is a promising way to fix this.
In a local-first app, all data is stored locally on the client, available to be freely read and modified at any time.
When a network connection is available, changes are synchronized across clients, enabling real-time collaboration when clients are all online. This architecture benefits end-users by giving them more ownership and control over their own data, and allowing apps to remain usable when the network is spotty or nonexistent.
While it might seem that a local-first architecture would make applications *more complicated* to build—after all, in a traditional cloud architecture, supporting offline mode is indeed complicated—-but we think that the local-first architecture creates an opportunity to make app development substantially simpler.

In particular, **local-first allows rich access to application state**.
After all, the entire app state is available locally with minimal latency.
With the data close at hand on a client device, we have an opportunity to construct our apps in a differnet way.
Could we take more integrated approaches to computing with data that make it easier for developers to build, maintain, and debug their applications? Can we make apps more performant by default? Could apps become more customizable and composable by end users?
If an application developer can rely on a powerful state management layer, then their UI code can just read and write local data, without worrying about synchronizing data, sending API requests, caching, or optimistically applying local updates.
Writing an application that spans across devices and users could feel closer to simply writing a local-only app.

This insight is not totally novel: many local first-apps already use general-purpose [CRDT](https://github.com/automerge/automerge) [libraries](https://github.com/yjs/yjs) to automatically synchronize their state between users, removing traditional server layers.

With immediate access to local data, we think that **databases have many solutions to state problems**.
Reseachers and engineers have worked for nearly 50 years to design computer systems that specialize in managing state: databases!
The power of client-side databases is already well-known—many complex desktop and mobile apps (e.g. Adobe Lightroom, Apple Photos and Google Chrome) use the SQLite embedded relational database to manage data.
We are especially interested in work on better query languages and fast incremental view maintenance, both of which have advanced considerably in recent years.
However, many of these ideas are implemented only in high-end analytics products, or a system with high latency, or some other piece of technology that is unsuitable for app development.
We think there are even greater opportunities to apply ideas from database research to app development.

In the Riffle project, we're interested in building on these ideas and taking them to the extreme, exploring their full implications across the entire UI stack.
To start exploring these ideas in practice, we've built an initial prototype: a reactive framework for SQLite, integrated with React.js to power apps running both in the browser and on the desktop using Tauri. Building apps using the prototype has already yielded some insight into opportunities and challenges, which we share in this essay.

## Principles

We started our project with some specific design principles we thought could simplify state management in GUI apps. Each principle draws on extensive prior work in databases and UI development, but we suspected they'd be powerful when combined together in one system.

### Declarative queries clarify application structure

![](/assets/blog/prelude/declarative.png)

Most applications have some canonical, normalized base state which must be further queried, denormalized, and reshaped before it can populate the user interface. For example, in a music app, if a list of tracks and albums is synced across clients, the UI may need to join across those collections and filter/group the data for display.

In existing app architectures, a large amount of effort and code is expended on collecting and reshaping data.
A traditional web app might first convert from SQL-style tuples to a Ruby object, then to a JSON HTTP-response, and then finally to a frontend Javascript object in the browser.
Each of these transformations is performed separately, and there is often considerable developer effort in threading a new column all the way through these layers.

<aside>
As we'll discuss throughout this piece, SQL as a specific instantiation of the relational model has some shortcomings. This has often led to adding layers around SQL, like ORMs and GraphQL. However, in principle, a sufficiently ergonomic replacement for SQL could eliminate the need for such additional layers.
</aside>

In a local-first application, this doesn't need to be the case; all the queries can happen directly within the client. This raises the question: how should those queries be constructed and represented? We suspect that a good answer for many applications is to use a **relational query model** directly within the client UI code.
Anyone who has worked with a relational database is familiar with the convenience of using declarative queries to express complex reshaping operations on data.
Declarative queries express intent more concisely than imperative code, and allow a query planner to design an efficient execution strategy independently of the app developer's work.

This is an uncontroversial stance in backend web development where SQL is commonplace; it's also a common approach in the many complex desktop apps that use SQLite as an embedded datastore (including Adobe Lightroom, Apple Photos, and Google Chrome).
It's not a common approach to managing state in client-side web development, although there have been successful projects in this area, including [Datascript](https://github.com/tonsky/datascript), an in-memory Datalog implementation for UI development, and [SQL.js](https://sql.js.org/#/), which compiles SQLite to run in a browser (and more recently, the [absurd-sql](https://jlongster.com/future-sql-web) project which persists a SQL.js database using IndexedDB).
In many ways, powerful end-user focussed tools like [Airtable](https://www.airtable.com/) are thematically similar: Airtable users express data dependencies in a spreadsheet-like formula language that operates primarily on tables rather than scalar data.
We think relational queries in the client UI is a pattern that deserves to be more widely used.

### Fast reactive queries provide a clean mental model

![](/assets/blog/prelude/reactive.png)

A *reactive* system tracks dependencies between data and automatically keeps downstream data updated, so that the developer doesn't need to manually propagate change. Frameworks like [React](https://reactjs.org/), [Svelte](https://svelte.dev/), and [Solid]() have popularized this style in web UI development, and end-users have built complex reactive programs in spreadsheets for decades.

However, database queries are often not included in the core reactive loop. When a query to a backend database requires an expensive network request, it's impractical to keep a query constantly updated in real-time; instead, database reads and writes are modeled as *side effects* which must interact with the reactive system. Many applications only pull new data when the user makes an explicit request (e.g. reloading a page); doing real-time pushes usually requires carefully designing a manual approach to sending diffs between a server and client.

In a local-first architecture where queries are much cheaper to run, we can take a different approach. The developer can register _reactive queries_, where the system guarantees that they will be updated in response to changing data. Reactive queries can also depend on each other, and the system will decide on an efficient execution order and ensure data remains correctly updated.

This appraoch is closely related to the _document functional reactive programming (FRP)_ introduced in [Pushpin](https://www.inkandswitch.com/pushpin/), except that we use a relational database rather than a JSON CRDT as our data store, and access them using a query language instead of a frontend language like Javascript.
We can also [create reactive derived values from our data outside of the tree of UI elements](https://www.youtube.com/watch?v=_ISAA_Jt9kI), as in systems like [Jotai](https://jotai.org/), [Recoil](https://recoiljs.org/), and [RxJS](https://rxjs.dev/)

<aside>
<Markdown>

As we discussed our ideas with working app developers, we found that many people who work with databases in a web context has an intuition that _databases are slow_.
This is striking because even primitive databases like SQLite are fast on modern hardware: many of the queries in our demo app run in a few hundred _microseconds_ on a few-years-old laptop.

We hypothesize this is because developers are used to interacting with databases over the network, where network latencies apply. Also, developer intuitions about database performance were developed when hardware was much slower—modern storage is fast, and many often datasets fit into main memory even on mobile devices. Finally, many relational database management systems aren't built for low latency—many databases are built for analytics workloads on large data sets, where a bit of extra latency is irrelevant to overall performance.
</Markdown>
</aside>

Low latency is a critical property for reactive systems. A small spreadsheet typically updates instantaneously, meaning that the user never needs to worry about stale data; a few seconds of delay when propagating a change would be a different experience altogether. The goal of a UI state management system should be to converge all queries to their new result within a single frame after a write; this means that the developer doesn't need to think about temporarily inconsistent loading states, and the user gets fast software.

This performance budget is ambitious, but there are reasons to believe it's achievable if we use a relational model. The database community has spent considerable effort making it fast to execute relational queries; many SQLite queries complete in well under one millisecond. Furthermore, there has been substantial work on incrementally maintaining relational queries (e.g., [Materialize](https://materialize.com/), [Noria](https://github.com/mit-pdos/noria), [SQLive](https://sqlive.io/), and [Differential Datalog](https://github.com/vmware/differential-datalog)) which can make small updates to queries much faster than re-running from scratch.

### Managing all state in one system provides greater flexibility

![](/assets/blog/prelude/unified.png)

Traditionally, ephemeral "UI state," like the content of a text input box, is treated as separate from "application state" like the list of tracks in a music collection. One reason for this is performance characteristics—it would be impractical to have a text input box depend on a network roundtrip, or even blocking on a disk write.

With a fast database close at hand, this split doesn't need to exist. What if we instead combined both "UI state" and "app state" into a single state management system? This unified approach would help with managing a reactive query system—if queries need to react to UI state, then the database needs to somehow be aware of that UI state. Such a system could also present a unified system model to a developer, e.g. allow them to view the entire state of a UI in a debugger.

It would still be essential to configure state along various dimensions: persistence, sharing across users, etc.
But in a unified system, these could just be lightweight checkboxes, not entirely different systems.
This would make it easy to decide to persist some UI state, like the currently active tab in an app. UI state could even be shared among clients—in real-time collaborative applications, it's often useful to share cursor position, live per-character text contents, and other state that was traditionally relegated to local UI state.

TK related work to weave in
- Elm architecture
- Redux
- **Cloud Full-stack reactivity**
    - Meteor
    - Firebase


## Prototype system: SQLite + React

![](/assets/blog/prelude/prototype.png)

We built an initial prototype of Riffle: a state manager for web browser apps, implemented as a reactive layer over the SQLite embedded relational database. The reactive layer runs in the UI thread, and sends queries to a SQLite database running locally on-device. For rendering, we use React, which interacts with Riffle via custom hooks.

To run apps in the browser (pictured above), we run the SQLite database in a web worker and persist data to IndexedDB, using [SQL.js](https://sql.js.org) and [absurd-sql](https://github.com/jlongster/absurd-sql). We also have a desktop app version based on [Tauri](https://tauri.studio/) (an Electron competitor that uses native webviews instead of bundling Chromium); in that architecture we run the frontend UI in a webview and run SQLite in a native process, persisting to the device filesystem.

For this prototype, our goal was to rapidly explore the experience of building with local data, so we reduced scope by reusing existing tools like SQLite, and by building a _local-only_ prototype which doesn't actually do multi-device sync. Syncing a basic SQLite-based CRDT across devices is already a [solved problem](https://archive.jlongster.com/using-crdts-in-the-wild) so we're confident it can be done; we have further ideas for designing sync systems which we'll share in our next essay.

In this section, we’ll demo our prototype by showing how to use it to build a simplified iTunes-style music app. Our music collection is a very natural fit for a relational schema containing several normalized tables linked by foreign keys. Each track has an ID and name, and belongs to exactly one album:

**tracks**

| id | name | album_id | artist_id
| --- | --- | --- | --- |
| 1 | If I Ain’t Got You | 11 | 21
| 2 | Started From the Bottom | 12 | 22
| 3 | Love Never Felt So Good | 13 | 23

**albums**

| id | name |
| --- | --- |
| 11 | The Diary of Alicia Keys |
| 12 | Nothing Was The Same |
| 13 | XSCAPE |

**artists**

| id | name |
| --- | --- |
| 21 | Alicia Keys |
| 22 | Drake |
| 23 | Michael Jackson |

### A first reactive query

In our app, we’d like to show a list view, where each track has a single row showing its album and artist name. Using SQL, it’s straightforward to load the name for each track, and to load the name of its album and artist. We can do this declaratively, specifying the tables to join separately from any particular join strategy.

<aside>
One downside of SQL here is that the join syntax is verbose; in a language like GraphQL we could traverse this association more compactly.
</aside>


```sql
select
  tracks.name as name,
  albums.name as album
  artists.name as artist
from tracks
  left outer join albums on tracks.album_id = albums.id
  left outer join artists on tracks.artist_id = artists.id
```
This query will produce results like this:

| name | album | artist |
| --- | --- | --- |
| If I Ain’t Got You | The Diary of Alicia Keys | Alicia Keys |
| Started From the Bottom | Nothing Was The Same | Drake |
| Love Never Felt So Good | XSCAPE | Michael Jackson |

Once we’ve written this query, we’ve already done most of the work for showing this particular UI. We can simply extract the results and use a JSX template in a React component to render the data:

```jsx
import { db, useQuery } from 'riffle'

const tracksQueryString = sql`
  select
    tracks.name as name,
    albums.name as album_name
    artists.name as album_name
  from tracks
    left outer join albums on tracks.album_id = albums.id
    left outer join artists on tracks.artist_id = artists.id
`

// use hardcoded SQL string for our query
const tracksQuery = db.query(() => tracksQueryString)

const TrackList = () => {
  // Subscribe to reactive query
  const tracks = useQuery(tracksQuery)

  return <table>
    <thead>
      <th>Name</th>
      <th>Album</th>
      <th>Artist</th>
    </thead>
    <tbody>
      {tracks.map(track => <tr>
        <td>{track.name}</td>
        <td>{track.album}</td>
        <td>{track.artist}</td>
      </tr>)}
    </tbody>
  </table>
}
```

We can also represent this component visually. Currently it contains a single SQL query which depends on some global app state tables, as well as a view template.

![](/assets/blog/prelude/component-1.png)

The UI looks like this:

![](/assets/blog/prelude/tracklist.png)

<aside>
Currently our prototype implements a naive reactivity approach: re-running all queries from scratch any time their dependencies change. This still turns out to usually be fast enough because SQLite can run many common queries in under 1ms. In the future, we plan to use incremental view maintenance to keep queries maintained more efficiently.
</aside>

Importantly, this query doesn’t just execute once when the app boots. It’s a **reactive query**, so any time the relevant contents of the database change, the component will re-render with the new results. For example, when we add a new track to the database, the list updates automatically.

### Reacting to UI state in the database

Next, let's add some interactive functionality by making the table sortable when the user clicks on the column headers. The current sort property and direction represents a new piece of *state* that needs to be managed in our application. A typical React solution might be to introduce some local component state with the `useState` hook. But the idiomatic Riffle solution is to avoid React state, and instead to store the UI state in the database.

Our prototype has a mechanism for storing local state associated with UI components. Each type of component gets a relational table, with a schema that defines the local state for that component. Each row of the table is associated with a specific instance of the component, identified by a unique ID called the *component key.*

How are component instance IDs chosen? An app developer can choose from several strategies:

- **Ephemeral**: every time React mounts a new component instance, generate a fresh random ID. This replicates the familiar behavior of React’s local state. Once a component unmounts, we can safely garbage collect its state from the table.
- **Singleton:** always assign the same ID, so that the table only has one row. This is useful for a global `App` component, or any situation where we want all instances of the component type to share state.
- **Custom**: The developer can choose a custom key to identify a component across mounts. For example, a track list might be identified by the playlist it’s displaying. Then, a user could toggle back and forth between viewing two different track lists, while preserving the sort state within each list separately.

In our example scenario, our app is simple enough so far that we only need to manage state for a single global track list; we can use the singleton strategy and keep the table limited to a single row. The table will look like this:

**component__TrackList**

| id | sortProperty | sortDirection |
| --- | --- | --- |
| SINGLETON | name | asc |

In our code, we can use Riffle's `useComponentState` hook to access getter and setter functions to manipulate the state. This hook resembles React's `useState` hook but is implemented in terms of simple database queries. The getters are reactive queries that incorporate the key for this component instance; the setters are syntax sugar for update statements which also incorporate the component key.

```jsx
import { db, useComponentState } from 'riffle'

const TrackListSchema = {
  componentType: "TrackList",
  columns: {
    sortProperty: "string",
    sortDirection: "string"
  }
}

const TrackList = () => {
  const [state, set] = useComponentState(TrackListSchema, { key: Singleton })
  const tracks = useQuery(tracksQuery)

  return <table>
    <thead>
      <th onClick={set.sortProperty("name")}>Name></th>
      <th onClick={set.sortProperty("album_name")}>Album></th>
      <th onClick={set.sortProperty("artists")}>Artists</th>
    </thead>
  //...
}
```

<aside>
The function that generates our SQL query can use a `get` operator to read other reactive values. This doesn't just read the current value; it creates a reactive dependency.
</aside>

Next, we need to actually use this state to sort the tracks. We can interpolate the sort property and sort order into the SQL query that fetches the tracks.

```jsx
// Define SQL query for tracks list
const sortedTracks = db.query((get) => sql`
select *
from (${get(tracksQuery.queryString)})
  left outer join albums on tracks.album_id = albums.id
  order by ${get(state.sortProperty)} ${get(state.sortOrder)}
`)
```

This new query for sorted tracks depends on the local component state, as well as the original tracks query:

![](/assets/blog/prelude/component-2.png)

Now when we click the table headers, we see the table reactively update:

<video controls="controls" muted="muted" src="/assets/blog/prelude/sort.mp4" playsinline="" />

Of course, this is functionality that would be easy enough to build in a normal React app. What have we actually gained by taking the Riffle approach here?

First, it's **simpler to understand** what's going on in the system, because the system has structured dataflow at runtime which exposes the provenance of computations. If we want to know why the tracks are showing up the way they are, we can inspect a query, and transitively inspect that query’s dependencies, just like in a spreadsheet.

Second, we can achieve more **efficient execution** by pushing computations down into a database. For example, we can maintain indexes in a database to avoid the need to sort data in application code, or manually maintain ad hoc indexes.

Finally, UI state is **persistent by default**. It’s often convenient for end-users to have state like sort order or scroll position persisted, but it takes active work for app developers to add these kinds of features. In Riffle, persistence comes for free, although ephemeral state is still easily achievable by setting up component keys accordingly.

### Doing full text search in the database

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
const filteredTracks = db.query((get) => {
  let query = sql`select * from tracks_full_text`

  // If search term is present, filter using full text index
  if(state.searchTerm() !== "") {
    query = sql`${query} where tracks_full_text match "${get(state.searchTerm)}*"`
  }
  return query
})
```

Revisiting our graph of dependent queries, there’s now a new layer:

![](/assets/blog/prelude/component-3.png)

Now, when the user types into the search box, their search term appears and filters the list of tracks:

<video controls="controls" muted="muted" src="/assets/blog/prelude/search.mp4" playsinline="" />

Interestingly, because we’re using a controlled component, every keystroke the user types must round trip through the Riffle database before it is shown on the screen, which imposes tight constraints on database latency: ideally we want to finish updating the input and all its downstream dependencies within a few milliseconds.

It's unusual to send user input through the database before showing it on the screen, but there’s a major advantage to this approach. If we can consistently achieve this performance budget and refresh our reactive queries *synchronously*, the application becomes easier to reason about, because it always shows a single consistent state at any point in time. For example, we don’t need to worry about handling the case where the input text has changed but the rest of the application hasn’t reacted yet. In our experience so far, SQLite can run most queries fast enough to make this approach work. (Later in Findings we discuss what to do about the cases where it's not fast enough.)

### Selection state in the database

As another example of the speed that this approach can achieve—we can store the currently selected track state in the database. The system is responsive enough to make selection feel perfectly responsive, even though it's roundtripping through the database every time the selection changes:

<video controls="controls" muted="muted" src="/assets/blog/prelude/selection.mp4" playsinline="" />

### Building virtualized list rendering from scratch

Personal music collections can get large—it’s not uncommon for one person to collect hundreds of thousands of songs over time. With a large collection, it’s too slow to render all the rows of the list to the DOM, so we need to use *virtualized* list rendering: only putting the actually visible rows into the DOM, with some buffer above and below.

With Riffle, implementing a simple virtualized list view from scratch only takes a few lines of code. We start by representing the current scroll position in the list as a new state column on the track list component, `scrollIndex`. As the user scrolls, we use an event handler on the DOM to update this value, essentially mirroring the stateful scroll position of the DOM into the database. We also throttle updates to happen at most once every 50ms to avoid overwhelming the database with writes during rapid scrolling.

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
This simple approach to virtualized list rendering turns out to be fast enough to support rapid scrolling over a large collection of tracks.

<video controls="controls" muted="muted" src="/assets/blog/prelude/scroll.mp4" playsinline="" />

 Because all the data is available locally and we can query it quickly, we don’t need to reason about manual caches or downloading paginated batches of data; we can simply declaratively query for the data we want given the current state of the view.

### Editing the data from outside the app

_todo: merge this w/ the finding below?_

One thing we've found intriguing about our prototype is that we can inspect and edit the entire state of the system in a generic database editor. When using the desktop version of our app, the database is stored in a SQLite file on disk which can be opened in a tool like TablePlus. In addition to debugging any state in the app, we can also do things like change the current sort order or play/pause music. Of course, this could also be done programatically by a script that talks to the database.

We've also explored this idea for integrating with external services. We've built features for playing music on Spotify; normally this would involve the application making imperative calls to the Spotify API. Instead we've tried to model this as a problem of shared state: both our application and Spotify are reading/writing from the same SQLite database. In practice, the application can simply use the database; we have a separate daemon which observes the database and syncs its state with Spotify.

### Building a complex app?

So far we've shown a very simple example, but how does this approach actually scale up to a more complex app? To answer this question, we've been using a version of Riffle to build a full-featured music manager application called MyTunes, which has richer UI for playlists, albums, artists, current play state, and more.

![](/assets/blog/prelude/mytunes.png)

So far, it appears that the basic model is viable, but much work remains to make the experience pleasant for an application developer. One challenge has been integrating Riffle's reactive queries with React's own reactivity in a way that doesn't create confusion for a developer. Another challenge has been maintaining low latency even as the app grows in complexity. Finally, there are many details we're still working on which aren't essential to the idea but which matter greatly for the developer experience, including API design, static types for query results, schema and migration management.

## Findings

Overall, working with our prototype system made us optimistic that this is a promising direction for simplifying application development. At the same time, it also clarified some of the challenges to making this approach truly work. Here are some of our reflections.

### Relational queries make it easier to understand running programs

We began with the observation that a lot of program complexity comes from managing state and propogating state changes, and that declarative quries are a natural, ergonomic way to express those data transformations.

<aside>
<Markdown>
Why was SQL not more helpful for reading code? For one, SQL is not an especially ergonomic language for many of the transformations that an app developer needs, especially those that involve returning nested data types.
In addition, few frontend developers are deeply familiar with SQL, and it feels distinctly out-of-place in the middle of a React app.
</Markdown>
</aside>

In practice, writing data transformations in SQL helped less than we expected from the perspective of _statically_ understanding code, i.e. reading code in a text editor. However, we found that relational queries created intriguing opportunities to understand data transformations _dynamically_ while an app is running.
As we built our our debugger, we were impressed by how useful it was to inspect entire result sets from queries in our data transformation pipeline.
Since our queries are tightly bound to UI components, being able to look at the "data behind the UI" made it much easier to hunt down the particular step in the transformation pipeline that had the bug.
This feature was so useful that we found ourselves reaching for a hacky alternative in versions of Riffle where the debugger was broken: adding logic to dump query results to a table in the database, and inspecting those in TablePlus.

It's interesting to compare this set-wise debugging from debuggers in imperative programs.
Imperative debuggers can iterate through a for-loop (or equivalently, a map) but we usually don't see all the data at once.
The pervasive use of relational queries seems to be a better fit for debugging data-intensive programs, although we feel that we've only scratched the surface of the problem.

### Both users and developers can benefit from a unified approach to UI data and app data

We found it nice to treat all data, whether ephemeral "UI data" or persistent "app data", in a uniform way, and to think of persistence as a lightweight property of some data, rather than a foundational part of the data model.

We were frequently (and unexpectedly) delighted by the persistent-by-default UI state.
In most apps, closing a window is a destructive operation, but we found ourselves delighted to restart the app and find ourselves looking at the same playlist that we were looking at before. It made closing or otherwise "losing" the window feel much safer to us as end-users.

Admittedly, this persistence was also frustrating to us as developers at times: restarting the app didn't work as well when the buggy UI state persisted between runs.
We often found ourselves digging through the database to delete the offending rows.
This did lead to another observation, though: in this model, we can decouple _restarting the app_ from _resetting the state_. Since the system is entirely reactive, we could reset the UI state completely without closing the app.

Another challenge was fitting compound UI state like nested objects or sequences into the relational model. For now, we've addressed this challenge by serializing this kind of state into a single scalar value within the relational database. However, this approach feels haphazard, and it seems important to find more ergonomic relational patterns for storing common kinds of UI state.

### Migrations are a challenge, and existing tooling makes them painful.

In our experience, migrations are a consistent pain when working with SQL databases.
However, our prototype created entirely new levels of pain because of the frequency with which our schema changed.

<aside>
<Markdown>
This problem is reminiscent of some of the challenges of Smalltalk images, where code was combined with state snapshots.
</Markdown>
</aside>

In a more traditional architecture, state that's managed by the frontend gets automatically discarded every time the program is re-run.
Our prototype stores all state, including ephemeral UI state that would normally live exclusivley in the main object graph, in the database, so any change to the layout of that ephermeral state forced a migration.
In most cases, we chose to simply delete the relevant tables and recreate them while in development, which essentially recreates the traditional workflow with ephemeral state.

Of course, Riffle is not the first sytem to struggle with migrations; indeed, one of us has already done [extensive work on migrations for local-first software](https://www.inkandswitch.com/cambria/).
We believe that making migrations simpler and more ergonomic is a key requirement for making database-managed state as ergonomic as frontend-managed state.

### SQL has shortcomings for UI development

We were initially very enthusiastic about unlocking the power of SQL in a web app. We found a lot to like in SQL: the relational model provides a lot of advantages, query optimizers are very powerful, and a large number of people, including many who aren’t “software developers” can understand and even write it.

Nonetheless, SQL was a consistent thorn in our side during this project. The deficiencies of SQL are [well-known](https://www.scattered-thoughts.net/writing/against-sql), so we won’t belabour them here. A few key pain points for us were:

<aside>
<Markdown>
There are various extensions to SQL that support nesting, but many of them are not that good and the good ones are not widely available.
</Markdown>
</aside>

1. Standard SQL doesn’t support nesting, even in the projection step (i.e., what describes the shape of the results). We’re big fans of data normalization, but it’s very convenient to nest data when producing outputs.

2. SQL syntax is verbose and non-uniform. SQL makes the hard things possible, but the simple things aren’t easy. Often, making small changes to the query requires rewriting it completely. In our prototype, we even ended up adding a small GraphQL layer on top of SQL for ergonomic reasons.
3. SQL’s scalar expression language is weird and limited. Often, we wanted to factor out a scalar expression for re-use, but doing this in SQLite was annoying enough that we didn’t do it often.

We view these issues as shortcomings of *SQL in particular*, and not the idea of a relational query language in general. Better relational languages could make UI development more ergonomic and avoid the need for clumsy ORM layers. Also, the prospect of replacing SQL seems more realistic in a domain like frontend UI where SQL hasn't yet taken hold in the first place.

While we tried to stick to well-known technologies like SQL in our prototype, we are excited about the potential of newer relational languages like [Imp](https://github.com/jamii/imp/tree/v1) and Datalog.

### Performance is a challenge with existing tools

In principle, declarative queries should be a step towards good app performance by default. The application developer can model the data conceptually, and it is up to the database to find an efficient way to implement the read and write access patterns of the application. Even a simple database like SQLite offers tools like indexes to respond to those access patterns; these tools are largely decoupled from the data model itself, and can even be modified without changing the queries.

In practice, our results have been mixed.

<aside>
<Markdown>

 We've traced slow queries back to the limitations of SQLite's [query optimizer](https://www.sqlite.org/optoverview.html). For example, it doesn't optimize across subquery boundaries, but we made extensive use of subqueries to modularize our queries. Also, it only does simple nested loop joins, which can be slow for joins on large tables. As an experiment, we tried replacing SQLite with [DuckDB](https://duckdb.org/), a newer embedded database focused on analytical query workloads with a [state-of-the-art optimizer](https://duckdb.org/why_duckdb#standing-on-the-shoulders-of-giants). We saw the runtimes of several slow queries drop by a factor of 20, but some other queries got slower because of known limitations in their current optimizer. Ultimately we plan to explore incremental view maintenance techniques so that a typical app very rarely needs to consider slow queries or caching techniques.
</Markdown>
</aside>

On the bright side, the core database itself has been mostly fast. Even running in the browser using WebAssembly, SQLite is fast enough that most queries with a few joins over a few tens of thousands of rows complete in less than a millisecond. We've had some limited exceptions, which we've worked around for now by creating materialized views which are recomputed outside of the main synchronous reactive loop.

However, outside of the database proper, we've encountered challenges in making a reactive query system that integrates well with existing frontend web development tools in a performant way.

One challenge has been inter-process communication. When the reactive graph is running in the UI thread and the SQLite database is on a web worker or native process, each query results in an asynchronous call that has to serialize and deserialize data. When trying to run dozens of fast queries within a single animation frame, we've found that this overhead can become a major source of latency. One solution we're exploring is to synchronously run SQLite in the UI thread, and to asynchronously mirror changes to a persistent database.

<aside>
<Markdown>
Some React alternatives like [Svelte](https://svelte.dev/) and [SolidJS](https://www.solidjs.com/) take a different approach: tracking fine-grained dependencies (either at compile-time or runtime) rather than diffing a virtual DOM. We think this style of reactivity could be a good fit for a Riffle state management framework built around incremental query maintenance, but for now we've chosen to prototype with React because it's the UI framework we're most familiar with.
</Markdown>
</aside>

Another challenge has been integrating with React. In an ideal world, a write would result in Riffle fully atomically updating the query graph in a single pass, and minimally updating all the relevant templates. However, to preserve idiomatic React patterns (like passing component dependencies using props), we've found that it sometimes takes a few passes to respond to an update—a write occurs, Riffle queries update, React renders the UI tree and passes down new props, Riffle queries are updated with new parameters, then React renders the tree again, and so on. We're still finding the best patterns to integrate with React in a fast and unsurprising way.

Rendering to the DOM has been another source of performance problems. We've seen cases where the data for a playlist of tracks can be loaded in <1ms, but the browser takes hundreds of milliseconds to compute the CSS styles and layout.

We think there are reasonable solutions to each of these performance challenges in isolation, but we suspect the best solution is a more integrated system that doesn't build on existing layers like SQlite and React.

### It's useful to model an app as a declarative query over the app state

This version of Riffle was built on top of React, but while React components are (special) functions, a Riffle component is much more highly structured.
Conceptually, a component is a combination of some queries that implement the data transformations, a JSX template for rendering that component to the DOM, and a set of event handlers for responding to user actions.

[TK insert picture]

In some sense, the template is also a "query": it's a pure function of the data returned by the queries, and its expressed in a declarative, rather than imperative style!
So, we could view the queries and template together as a large, tree-structured view of the data.

<aside>
<Markdown>
This perspective ends up looking a lot like [Relational UI](https://www.scattered-thoughts.net/writing/relational-ui/), a relational langauge for defining UIs: the app is _defined_ as query over the data, with results that define the UI elements on the screen.
</Markdown>
</aside>

We can extend this perspective even further: each component takes some arguments (props, in React parlance), which might themselves be queries, but are also a pure function of the data.
We can therefore see the entire component tree in the same way: it's one giant query that defines a particular view of the data.
This view is precisely analgous to the concept of a "view" in SQL database, except that instead of containing tabular data, it is a tree of DOM nodes.

In this light, the problem of maintaing the app "view" as the user interacts with the app is a problem of _incremental view maintenance_, a problem that has been the subject of decades of research in the database community.
We elaborate on this connection below, but we believe that there are opportunities to apply ideas from incremental view maintenance to build fast and understandable app frameworks.

### Data-based interoperability offers advantages over action-based APIs.

Since the introduction of object-oriented programming, most interoperability has been “verb-based”: that is, based on having programs call into each other using APIs. Indeed, new programmers are often taught to hide data behind APIs as much as possible in order to encapsulate state.

In our prototype, we found dramatic benefits to turning this paradigm on its head. Instead of using verb-based APIs for interoperability, we used *shared data representations* to create “noun-based” interoperability surfaces. We observed three major advantages to this approach.

First, we found it very decouple read- and write-paths: the source application can write the data in a convenient format, while the target application can query it to obtain data in a different convenient format. Often, the most convenient write path is an event log, but consuming an event log is quite difficult for other apps.

Second, <a href="https://twitter.com/andy_matuschak/status/1452438198668328960">verb-based APIs create an unfortunate n-to-n problem</a>: every app needs to know how to call the APIs of every other app. In contrast, data-based interoperability can use the shared data directly: once an app knows how to read a data format, it can read that data regardless of which app produced it.

Third, we found that treating the data format as a core interface for an app solves many problems that are plague modern apps. Many users who are familiar with standard UNIX tools and conventions speak wistfully of “plain text” data formats, despite its disadvantages. We feel that plain text is an unfortunate way to store data in general, but recognize what these users long for: a source of truth that is *legible* outside of the application, possibly in ways that the application developer never anticipated. As we saw in our TablePlus demo, data-based interoperability provides these advantages while also providing the advantages of a structured file format.

## Towards a reactive, relational approach to state management

Our early investigations suggest that a local-first, data-centric architecture radically simplifies some parts of app development.
We also know that it is at least somewhat practical: we've managed to build a real app that works with moderate amounts of data and has good performance.
These experiments make us particularly excited about the transferability of insights and technologies from the database reserach community to the domain of app development.

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
We could also extend the stack in the other direction by treating the application of events in an event log into readable data as a query as well, as in Martin Kleppmann's [implementation of a text CRDT using Datalog](https://martin.kleppmann.com/2018/02/26/dagstuhl-data-consistency.html).

Taken to the extreme, we end up with a minimal model of an interactive app, where users take actions that are recorded in an event log, and then those actions cause changes in a UI described entirely by a declarative query.

### What might compressing the stack into a query get us?

While this is clean and elegant concept, there's a natural question of whether it actually leads to any progress in our quest to make app development simpler, faster, and more powerful.
There are some benefits from _stack compression_, where what were previously a set of disparate technologies--event handling, data querying, and UI rendering--can be represented in a uniform way.
However, we think that the primary benefit of this uniformity comes from the ability to more easily _reason across the layers of the stack_.

For example, let's consider performance.
User-facing apps face performance challenges that don't show up in other types of programs, especially when it comes to _latency_. Users are [exquisitely](https://www.inkandswitch.com/slow-software/) [sensitive](https://danluu.com/input-lag/) to even small amounts of latency, and we believe that low latency is a key property of the types of creative tools that we're excited about.
A key challenge in building performant apps is performing _incremental updates_: it's often much easier to describe how to build the UI from scratch than to figure out how it must update in response to a new event, but it's often too expensive to rebuild the UI from scratch every frame as in immediate-mode GUI tools.
Indeed, a key lesson from React and other virtual DOM-based tools is finding a way to automatically transform a build-from-scratch description of the UI into an incremental one.

In the past twenty years, researchers in the programming languages and database communities have developed various tools for automatically incrementalizing computation.
Many of these techniques are attempts to solve the _incremental view maintenance_ problem for relational databases, where a view of the data is dynamically maintained as new writes occur.

If the UI can be expressed in a way that is friendly to one of these automated incremental maintenance, perhaps as a declarative view of the data, we might be able to express user interfaces in a declarative, build-from-scratch way but obtain the perfromance benefits of incremental updates.
Other efforts in this space, like the [Incremental](https://opensource.janestreet.com/incremental/) and [inc-dom](https://www.janestreet.com/tech-talks/intro-to-incr-dom/) libraries, have shown considerable success in these directions.

While this seems like a purely technical benefit, we also believe that there are conceptual advantages to uniformity in the user interface stack.
Many systems for incremental maintenance work by tracking data _provnenance_: they remember where a particular computation got its inputs, so that it knows when that computation needs to be re-run.
We believe that understanding data provenance is also a fundamental tool in understanding app behaviour, for both app developers trying to debug the app and end users who are trying to extend it.

Imagine a browser-style developer console that allows you to click on a UI element and see what component it was generated from. In a system with end-to-end provenance, we could identify how this element came to be in a much deeper way, answering questions not just questions like "what component template generated this element?" but "what query results caused that component to be included?" and even "what event caused those query results to look this way?".
We saw an early example of this in our query debugger view, but we believe that this can be taken much further. In many ways, data provenance tracking seems like a key step towards fulfilling the vision of [Whyline](https://www.cs.cmu.edu/~NatProg/whyline.html), where any piece of an app can be inspected to determine _why_ it's in that state.

### End user programming through better abstractions

<aside>
<Markdown>
Airtable is by far the most polished expression of the relational model in a tool aimed at end users.
In our experience, users with no technical background besides computer office skills can be highly productive in Airtable after just a few months.
Nonetheless, Airtable has some significant limitations. Its query facilities are limited to what can be expressed in the view UI, and don't come close to expressing the full power of relational queries—for instance, it doesn't support general joins, or even nested filter predicates. Also, its performance degrades rapidly when a single database approaches the kinds of medium-sized data sets that we are most interested in, and it has a [hard limit of 50,000 records per base](https://support.airtable.com/hc/en-us/articles/115010928147-Airtable-plans).
</Markdown>
</aside>

We find a lot of inspiration in tools like Airtable, which draw from the relational model to create powerful tools targeted at end users. Airtable is a highly productive tool for building lightweight, reactive, data-centric apps, even for skilled software developers.
Airtable also contains a remarkable set of “escape hatches” that allow programmers to build embedded React apps within the Airtable UI.

Riffle attacks the problem from a different direction: instead of aiming at extremely simple use cases, it starts by trying to express the full power of a relational model to experienced developers.
We hope that these new abstractions can build a solid foundation on which higher-level tools can be built for end-users.

Put another way: you can’t use Airtable to write iTunes, but we’ve been able to use Riffle to make myTunes.

### Where we're going

We started this project wondering how the local-first availability of an app's data could change and simplify app development.
At this point, we're left with more questions than answers.
However, we see the outline of an appraoch where _user interfaces are expressed as queries_, those queries are executed by a fast, performant incremental maintenance system, and that incremental maintenance gives us _detailed data provnenace_ throughout the system.
Together, those ideas seem like they could make app development radically simpler and more accessible, possibly so simple that it could be done "at the speed of thought" by users who aren't skilled in app development.

We find a lot of inspiration from tools like spreadsheets, arguably the origin of the reactive programming model, and Airtable, which draws inspiration from the relational model.
These tools are highly productive in their domains; in our experience, they are _more productive_ than traditional developer tools even for skilled software engineers.
Nonetheless, they have significant technical and conceptual limitations; you can't use Airtable to write iTunes.
We hope that by taking a step back and developing some key abstractions, we can achieve the full expressive power of "general purpose" programming tools and simplify them dramatically, for experts and novices alike.

We're excited by this potential, and even more excited by the possiblity that we might already have the basic technological pieces to make that vision a reality.

---

<SubscriptionBox prompt="If you'd like to follow our work, consider subscribing for updates:" />

We'd love your feedback: we're reachable by email at [feedback@riffle.systems](mailto:feedback@riffle.systems) and on Twitter at [@geoffreylitt](https://twitter.com/geoffreylitt) and [@nschiefer](https://twitter.com/nschiefer)!

*We're grateful for clarifying conversations with Jamie Brandon, Josh Horowitz, Adam Jermyn, David Karger, Martin Kleppmann, Kevin Lynagh, Jalex Stark, and Peter van Hardenberg as we developed the ideas in this essay.
Geoffrey Litt was supported by an NSF GRFP Fellowship.
Nicholas Schiefer was supported by a Simons Investigator Award.*

---
