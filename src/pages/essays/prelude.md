---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
  import SubscriptionBox from '../../components/SubscriptionBox.astro'
title: Managing UI state with a reactive relational database
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

<div style="color: red; font-weight: bold;">Private draft for feedback, please don't share!</div>

Modern web applications have many redundant data representations spanning across the backend and frontend. For example, a "simple" app might use a relational database queried via SQL, an ORM on a backend server, a REST API used via HTTP requests, and objects in a rich client-side application, further manipulated in Javascript.

![](/assets/blog/prelude/layers.png)

While each layer may be justifiable in isolation, the need to work across all these layers results in tremendous complexity. Adding a new feature to an app often requires writing code in many languages at many layers. Understanding the behavior of an entire system requires tracking down code and data dependencies across many process and network boundaries. To reason about performance, developers must carefully design caching and indexing strategies at every level of the stack. As a result, user interface development is a specialized skill set: many skilled programmers like scientists struggle to build web UIs, and even advanced developers invest enormous effort to create performant, reliable apps.

How might we simplify this stack?

We think a promising direction is a [local-first](https://www.inkandswitch.com/local-first/) architecture, where all data is stored locally on the client, available to be freely read and modified at any time. When a network connection is available, changes are synchronized across clients, enabling collaborative applications including real-time collaboration when clients are online. This architecture benefits end-users by giving them more ownership and control over their own data, and allowing apps to remain usable when the network is spotty or nonexistent.

It might seem that a local-first architecture would make applications *more complicated* to build—after all, in a traditional cloud architecture, supporting offline mode is indeed complicated—but we think that the local-first architecture can make app development substantially simpler.
A large amount of effort in a cloud app is concerned with _managing state_: getting the data out of the database, making it available over APIs, and then orchestrating these API calls in just the right way.
On the client, most web UI technologies have been developed in a context where data is assumed to live far away on a server, and have assumed the associated complexity.
Now, the data can instead be immediately close at hand on the client device, enabling different approaches.

This insight is not novel: many local first-apps already use general-purpose [CRDT](https://github.com/automerge/automerge) [libraries](https://github.com/yjs/yjs) to automatically synchronize their state between users.
However, we believe that the local-first architecture offers even deeper opportunities for simplifying app development.
Could we take more integrated approaches to computing with data that make it easier for developers to build, maintain, and debug their applications? Can we make apps more performant by default? Could apps become more customizable and composable by end users?

In the Riffle project, we're interested in exploring these implications in the broadest sense. Our approach is based on three observations:

**Managing state is hard.** Especially in data-centric apps, a large part of the complexity of building and modifying the app comes from managing and propogating state.
In some sense, state management is the main thing that _makes an app an app_, and distinguishes app development from related tasks like data visualization.
In a traditional desktop app, state is usually split between app's main memory and various external stores, like filesystems and embededded databases.
In a web app, the situation is even worse: the app developer has to thread the state through from the backend database to the frontend and back.

**Local-first allows rich access to state.** In the local-first architecture, the entire app state is available locally with minimal latency. We think that this should make state management radically easier.
If an application developer can rely on a powerful state management layer, then their UI code can just read and write local data, without worrying about synchronizing data, sending API requests, caching, or optimistically applying local updates. Writing an application that spans across devices and users could feel closer to simply writing a local-only app.

**Databases have many solutions to state problems.** Reseachers and engineers have worked for nearly 50 years to design computer systems that specialize in managing state: databases!
The power of client-side databases is already well-known—many complex desktop and mobile apps (e.g. Adobe Lightroom, Apple Photos and Google Chrome) use the SQLite embedded relational database to manage data.
We are especially interested in work on better query languages and fast incremental view maintenance, both of which have advanced considerably in recent years.
However, many of these ideas are implemented only in high-end analytics products, or a system with high latency, or some other piece of technology that is unsuitable for app development.
We think there are even greater opportunities to apply ideas from database research to app development.

To start learning how these ideas might work in practice, we've built a prototype state management system: a reactive framework for SQLite, integrated with React.js to power apps running both in the browser and on the desktop using Tauri. Building apps using the prototype has already yielded some insight into the opportunities and challenges in this space.

## Hypotheses

As we started our project, we had some specific ideas about how ideas from databases could dramatically simplify state management in GUI apps.

### Declarative queries clarify application structure

![](/assets/blog/prelude/declarative.png)

Most applications have some canonical, normalized base state which must be further queried, denormalized, and reshaped before it can populate the user interface. For example, if a list of todos and projects is synced across clients, the UI may need to join across those collections and filter/group the data for display.

We observe that in existing app architectures, a large amount of effort and code is expended on collecting and reshaping data.
In traditional web applications, these data manipulations are spread across many different layers, including backend SQL queries, API calls, and client-side data manipulation: an app might first convert from SQL-style tuples to a Ruby object, then to a JSON HTTP-response, and then finally to a frontend Javascript object in the browser.
Each of these transformations is performed separately, and there is often considerable developer effort in threading a new column all the way through these layers.

<aside>
As we'll discuss throughout this piece, SQL as a specific instantiation of the relational model has some shortcomings. This has often led to adding layers around SQL, like ORMs and GraphQL. However, in principle, a sufficiently ergonomic replacement for SQL could eliminate the need for such additional layers.
</aside>

In a local-first application, this doesn't need to be the case: all the queries can happen directly within the client. This raises the question: how should these queries be constructed and represented? We suspect that a good answer for many applications is to use a **relational model** to express queries within the client UI code.
Anyone who has worked with a relational database is familiar with the convenience of using declarative queries to express complex reshaping operations on data.
Declarative queries express intent more concisely than imperative code, and allow a query planner to design an efficient execution strategy independently of the app developer's work.

This is an uncontroversial stance in backend web development where SQL is commonplace; it's also a common approach in the many complex desktop apps that use SQLite as an embedded datastore (including Adobe Lightroom, Apple Photos, and Google Chrome). It's a less common approach to managing state in client-side web development, but we think it is a pattern that deserves to be [more](https://github.com/tonsky/datascript) [widely](https://jlongster.com/future-sql-web) [used](https://tonsky.me/blog/the-web-after-tomorrow/).

### Fast reactive queries provide a clean mental model

![](/assets/blog/prelude/reactive.png)

A *reactive* system tracks dependencies between data and automatically keeps downstream data updated, so that the developer doesn't need to manually propagate change. This approach has been proven effective in many contexts—React has popularized this style in web UI development, and end-users have built complex reactive programs in spreadsheets for decades.

However, database queries are often not included in the core reactive loop. When a query to a backend database requires an expensive network request, it's impractical to keep a query constantly updated in real-time; instead, database reads and writes are modeled as *side effects* which must interact with the reactive system. Many applications only pull new data when the user makes an explicit request (e.g. reloading a page); doing real-time pushes usually requires carefully designing a manual approach to sending diffs between a server and client.

In a local-first architecture where queries are much cheaper to run, we can take a different approach. The developer can register _reactive queries_, where the system guarantees that they will be updated in response to changing data. Reactive queries can also depend on each other, and the system will decide on an efficient execution order and ensure data remains correctly updated.

<aside>
<p>
As we discussed our ideas with working app developers, we found that many people who work with databases in a web context has an intuition that <em>databases are slow</em>.
</p>

<p>
This is striking because even primitive databases like SQLite are fast on modern hardware: many of the queries in our demo app run in a few hundred <em>microseconds</em> on a few-years-old laptop, much faster than even rudimentary DOM manipulations.
<p>

<p>
We hypothesize three key sources of this mistaken intuition:
</p>
1. Developers are used to interacting with databases over the network, where network latencies apply.
2. Developer intuitions about database performance were developed when hardware was much slower. Back in the days of spinning hard drives and 8 MB of RAM, a single disk seek could take many milliseconds. Modern hardware is astoundingly fast, and many more datasets fit into main memory even on mobile devices.
3. Many relational database management systems aren't built for low latency. For example, many databases are built for analytics workloads on large data sets, where small amounts of latency are irrelevant to overall performance.
</aside>

One key observation about reactive systems is that making the reactive loop faster can qualitatively change the user experience. For example, a small spreadsheet typically updates instantaneously, meaning that the user never needs to worry about stale data; even a few seconds of delay when propagating a change can create a different experience. We think the goal of a data management system should be to converge all queries to their new result within a single frame after a write; this means that the developer doesn't need to worry as about temporarily inconsistent loading states, and the user gets fast software.

This performance budget is ambitious, but there are reasons to believe it's achievable, especially if we use a relational model. The database community has spent considerable effort making it fast to execute relational queries; many SQLite queries complete in well under one millisecond. Furthermore, re-running queries from scratch is the most naive way to achieve reactivity, but there has been substantial work on incrementally maintaining relational queries (e.g., [Materialize](https://materialize.com/), [SQLive](https://sqlive.io/), and [Differential Datalog](https://github.com/vmware/differential-datalog)) which can make updates to queries much faster than re-running from scratch.

### Managing all state in one system provides greater flexibility

![](/assets/blog/prelude/unified.png)

Traditionally, ephemeral "UI state", e.g. local state in a React component, is treated as separate from "application state". One reason for this is performance characteristics—it would be impractical to have the hover-state of a button depend on a network roundtrip, or even blocking on a disk write. With a fast database so close at hand, this performance split doesn't necessarily need to exist.

What if we instead combined both "UI state" and "app state" into a single state management system? This unified approach could help with managing a reactive query system—if queries need to react to UI state, then the database needs to somehow be aware of that UI state. Such a system could also present a unified system model to a developer, e.g. allow them to view the entire state of a UI in a debugger.

It would still be useful to configure state along various dimensions: persistence, sharing across users, etc. But in a unified system, these could just be lightweight checkboxes, not entirely different systems. This configurability could have concrete benefits—for example, it's often useful to persist UI state, like the currently active tab in an app. Also, in modern real-time collaborative apps, UI state like cursor position or hover state is sometimes shared among clients. A unified approach to state could accommodate these kinds of changes more easily.

## Our prototype system

To explore these ideas concretely, we built a prototype of the Riffle system as a state manager for web browser apps. Because our goal was to understand the developer experience rather than build an entire system, we reused existing technologies wherever possible.

![](/assets/blog/prelude/prototype.png)

We built a reactive query layer over the SQLite embedded relational database, running in the browser with WASM via [SQL.js](https://sql.js.org/) project. We run SQLite in a web worker and persist data to IndexedDB, using the [absurd-sql](https://github.com/jlongster/absurd-sql) library. We've also built a desktop version which uses [Tauri](https://tauri.studio/) and runs SQLite in a native process. For rendering, we use React, which interacts with Riffle via custom hooks.

One major limitation of this prototype is that it's  _local-only_ system; we have not actually built a sync system for it. For this particular prototype we wanted to focus on the experience of building a UI with local data, rather than the sync aspects. It's already known that building a CRDT-based sync system with SQLite is possible (e.g., James Long's [Actual Budget](https://archive.jlongster.com/using-crdts-in-the-wild) project), and we plan to cover synchronization issues in future essays.

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

### Showing a list of tracks

In our app, we’d like to show a list view, where each track has a single row showing its album and artist name.

| Name | Album | Artist |
| --- | --- | --- |
| If I Ain’t Got You | The Diary of Alicia Keys | Alicia Keys |
| Started From the Bottom | Nothing Was The Same | Drake |
| Love Never Felt So Good | XSCAPE | Michael Jackson |

Using SQL, it’s straightforward to load the name for each track, and to load the name of its album and artist. We can do this declaratively, specifying the tables to join separately from any particular join strategy.

```sql
select
  tracks.name as name,
  albums.name as album_name
  artists.name as album_name
from tracks
  left outer join albums on tracks.album_id = albums.id
  left outer join artists on tracks.artist_id = artists.id
```
<aside>
One downside of SQL here is that the join syntax is verbose; in a language like GraphQL we could traverse this association more compactly.
</aside>

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

We can also represent this component and its single query visually:

![](/assets/blog/prelude/component-1.png)

<aside>
Our prototype implements the most naive reactivity approach: re-running all reactive queries any time the contents of the database change. This still turns out to be pretty fast because SQLite can run many common queries very fast. In general, this is an instance of the problem of incremental view maintenance [cite] and we plan to explore far more efficient strategies for keeping these queries updated.
</aside>

Importantly, this query doesn’t just execute once when the app boots. It’s a **reactive query**, so any time the relevant contents of the database change, the component will re-render with the new results. For example, when we add a new track to the database, the list updates automatically.

**todo: add animated screenshot**

### Sorting tracks

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

Next, we need to actually use this state to sort the tracks. We can interpolate the sort property and sort order into the SQL query that fetches the tracks. The function that generates our SQL query can use a `get` operator to read other reactive values.

```jsx
// Define SQL query for tracks list
const sortedTracks = db.query((get) => sql`
select *
from (${get(tracksQuery.queryString)})
  left outer join albums on tracks.album_id = albums.id
  order by ${get(state.sortProperty)} ${get(state.sortOrder)}
`)
```

This establishes a new reactive dependency. Up until now, the query string was hardcoded, and it would only reactively update when the database contents changed. Now, the query string itself depends on the local component state. Riffle’s reactivity system ensures that queries run in a correct dependency order—if the sort property changes, the query for that property must run before its result can be used in the tracks query.

![](/assets/blog/prelude/component-2.png)

Now when we click the table headers, we see the table reactively update!

*Video: show table headers sorting*

What have we gained by taking the Riffle approach here?

- We have structured dataflow that makes it easier to **understand the provenance** of computations. If we want to know why the tracks are showing up the way they are, we can inspect a query, and transitively inspect that query’s dependencies, just like in a spreadsheet.
- We can achieve more **efficient execution** by pushing computations down into a database. For example, we can maintain indexes in a database to avoid the need to sort data in our application or manually maintain ad hoc indexes in our app code.
- UI state is **persistent by default**. It’s often convenient for end-users to have state like sort order or scroll position persisted, but it takes active work for app developers to add these kinds of features. In Riffle, persistence comes for free, although local and ephemeral state are still easily achievable by setting up component keys accordingly.

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

*video figure: searching tracks*

Interestingly, because we’re using a controlled component, every keystroke the user types must round trip through the Riffle database before it is shown on the screen, which imposes tight constraints on database latency: ideally we want to finish updating the input and all its downstream dependencies within a few milliseconds.

It's unusual to send user input through the database before showing it on the screen, but there’s a major advantage to this approach. If we can consistently achieve this performance budget and refresh our reactive queries *synchronously*, the application becomes easier to reason about, because it always shows a single consistent state at any point in time. For example, we don’t need to worry about handling the case where the input text has changed but the rest of the application hasn’t reacted yet. In our experience so far, SQLite can run many queries fast enough to make this approach work, although we still plan to develop more asynchronous approaches for handling slower queries.

### Virtualized list rendering

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

This introduces yet another layer to our reactive query graph. Once again, by explicitly representing all these dependencies in Riffle, we gain two key advantages: the runtime can efficiently schedule incremental updates through the graph, and the user can inspect and understand the structure of the computation.

This simple approach to virtualized list rendering turns out to be fast enough to support rapid scrolling over a collection of 250k+ tracks. Because all the data is available locally and we can query it quickly, we don’t need to reason about manual caches or downloading paginated batches of data; we can simply declaratively query for the data we want given the current state of the view. The local-first architecture has enabled a much simpler approach.

### Interoperability through data-centric APIs

*todo*

Fun demo: TablePlus changing seach term / sort order

play state demo

API as noun not verb

briefly mention Spotify daemon

### Limitations of the prototype

Many things we haven’t had time for yet...

- sync! future project.
- access control, partial data views on client

## Findings

We see our work with our prototype as an exploratory experiments to understand our design principles in a serious context. As we iterated on our prototype, we came to some interesting conclusions.

### Relational queries enable qualitatively different ways to understand programs.

We began with the observation that a lot of program complexity comes from managing state and propogating state changes, and that declarative quries are a natural, ergonomic way to express those data transformations.
We hypothesized that this could make apps much easier to develop.
Although SQL is declarative, we found that expressing data transformations in SQL was not always especially easy for the app developer to interpet _statically_.
For one, SQL is not an especially ergonomic language for many of the transformations that an app developer needs, especially those that involve returning nested data types.
In addition, few frontend developers are deeply familiar with SQL, and it feels distinctly out-of-place in the middle of a React app.

Nonetheless, relational queries created intriguing opportunities to understand data transformations _dynamically_.
As we built our our debugger, we were impressed by how useful it was to inspect entire result sets from queries in our data transformation pipeline.
Since our queries are tightly bound to UI components, being able to look at the "data behind the UI" made it much easier to hunt down the particular step in the transformation pipeline that had the bug.
This feature was so useful that we found ourselves reaching for a hacky alternative in versions of Riffle where the debugger was broken: adding logic to dump query results to a table in the database, and inspecting those in TablePlus.

It's interesting to compare this set-wise debugging from debuggers in imperative programs.
Nearly all imperative debuggers work _point-wise_: we can iterate through a for-loop (or equivalently, a map) but we usually don't see all the data at once.
The pervasive use of relational queries seems to be a better fit for debugging data-intensive programs, although we feel that we've only scratched the surface of the problem.

### It's interesting to think of an entire app as a declarative query over the app state.

This version or Riffle was built on top of React, but while React components are (special) functions, a Riffle component is much more highly structured.
Conceptually, a component is a combination of some queries that implement the data transformations, a JSX template for rendering that component to the DOM, and a set of event handlers for responding to user actions.

[TK insert picture]

In some sense, the template is also a "query": it's a pure function of the data returned by the queries, and its expressed in a declarative, rather than imperative style!
So, we could view the queries and template together as a large, tree-structured view of the data.

We can extend this perspective even further: each component takes some arguments (props, in React parlance), which might themselves be queries, but are also a pure function of the data.
We can therefore see the entire component tree in the same way: it's one giant query that defines a particular view of the data.
This view is precisely analgous to the concept of a "view" in SQL database, except that instead of containing tabular data, it is a tree of DOM nodes.

In this light, the problem of maintaing the app "view" as the user interacts with the app is a problem of _incremental view maintenance_, a problem that has been the subject of decades of research in the database community.
We elaborate on this connection below, but we believe that there are opportunities to apply ideas from incremental view maintenance to build fast and understandable app frameworks.

### Data-based interoperability can be much better than action-based APIs.

Since the introduction of object-oriented programming, most interoperability has been “verb-based”: that is, based on having programs call into each other using APIs. Indeed, new programmers are often taught to hide data behind APIs as much as possible in order to encapsulate state.

In our prototype, we found dramatic benefits to turning this paradigm on its head. Instead of using verb-based APIs for interoperability, we used *shared data representations* to create “noun-based” interoperability surfaces. We observed three major advantages to this approach.

First, we found it very decouple read- and write-paths: the source application can write the data in a convenient format, while the target application can query it to obtain data in a different convenient format. Often, the most convenient write path is an event log, but consuming an event log is quite difficult for other apps.

Second, <a href="https://twitter.com/andy_matuschak/status/1452438198668328960">verb-based APIs create an unfortunate n-to-n problem</a>: every app needs to know how to call the APIs of every other app. In contrast, data-based interoperability can use the shared data directly: once an app knows how to read a data format, it can read that data regardless of which app produced it.

Third, we found that treating the data format as a core interface for an app solves many problems that are plague modern apps. Many users who are familiar with standard UNIX tools and conventions speak wistfully of “plain text” data formats, despite its disadvantages. We feel that plain text is an unfortunate way to store data in general, but recognize what these users long for: a source of truth that is *legible* outside of the application, possibly in ways that the application developer never anticipated. As we saw in our TablePlus demo, data-based interoperability provides these advantages while also providing the advantages of a structured file format.

### The difference between “UI data” and “domain data” is quantitative, not qualitative.

Traditional applications, especially web apps, tend to draw a sharp distinction between non-persistent “UI data” and persistent “domain data”: the former are ephemeral and stored only in the browser’s VM, while the latter are persisted to a backend database. Shifting a piece of state from one to the other requires largely re-architecting the application: for example, very few web applications will preserve UI properties like the sort order of a list or the contents of a search box.
We found that this distinction can be quite fluid in practice: it is easy for some data to start out as something ephemeral and slowly accumulate importance over time.
We found it quite nice to treat all data, whether ephemeral or persistent, in a uniform way, and think of persistence as a lightweight property of that data, rather than a foundational part of the data model.
While we didn’t tackle multi-device synchronization in this project, we see sync the same way: it’s should probably be more like a checkbox on a piece of state than a key modeling concern.

A key worry that we had early on is that the database would be too slow to unify state in this way, and we'd have to introduce various tricks to avoiding persisting every write to disk.
It turns out that even a simple database like SQLite is quite good at keeping commonly-modified pages in memory, and modern disks are fast enough that we didn't necessarily need to avoid flushing to disk, either
We were also frequently (and unexpectedly) delighted by the persistent-by-default UI state.
In most apps, closing a window is a profoundly destructive operation that feels fundamentally unsafe.
In contrast, we found ourselves delighted to restart the app and find ourselves looking at the same playlist that we were looking at before; it made closing or otherwise "losing" the window feel much safer to us as end-users.

Admittedly, this persistence was also frustrating to us as developers at times: the old trick of "turn it off and back on again" didn't work nearly as well when the buggy UI state persisted between runs.
We often found ourselves digging through the database to delete the offdending rows, although that too struck an interesting chord.
By persisting all state by default, we can decouple _restarting the app_ from _resetting the state_.
Since the system is entirely reactive, we could even reset the UI state without closing the app.

### Migrations are a fundamental challenge, and existing tooling makes them painful.

In our experience, migrations are a consistent pain when working with SQL databases.
However, our prototype created entirely new levels of pain because of the frequency with which our schema changed.
In a more traditional architecture, state that's managed by the frontend gets automatically discarded every time the progrma is re-run.
Our prototype stores all state, including ephemeral UI state that would normally live exclusivley in the main object graph, in the database, so any change to the layout of that ephermeral state forced a migration.
In most cases, we chose to simply delete the relevant tables and recreate them.

Of course, Riffle is not the first sytem to struggle with migrations; indeed, one of us has already done [extensive work on migrations for local-first software](https://www.inkandswitch.com/cambria/).
We believe that making migrations simpler and more ergonomic is a key requirement for making database-managed state as ergonomic as frontend-managed state.

### SQL has shortcomings for UI development

We were initially very enthusiastic about unlocking the power of SQL in a web app. We found a lot to like in SQL: the relational model provides a lot of advantages, query optimizers are very powerful, and a large number of people, including many who aren’t “software developers” can understand and even write it.

Nonetheless, SQL was a consistent thorn in our side during this project. The deficiencies of SQL are [well-known](https://www.scattered-thoughts.net/writing/against-sql), so we won’t belabour them here. A few key pain points were:

1. Standard SQL doesn’t support nesting, even in the projection step (i.e., what describes the shape of the results). We’re big fans of data normalization, but it’s very convenient to nest data when producing outputs.

    There are various extensions to SQL that support nesting, but many of them are not that good and the good ones are not widely available.

2. SQL syntax is verbose and non-uniform. SQL makes the hard things possible, but the simple things aren’t easy. Often, making small changes to the query requires rewriting it completely. In our prototype, we even ended up adding a small GraphQL layer on top of SQL for ergonomic reasons.
3. SQL’s scalar expression language is weird and limited. Often, we wanted to factor out a scalar expression for re-use, but doing this in SQLite was annoying enough that we didn’t do it often.

We view these issues as shortcomings of *SQL in particular*, and not the idea of a relational query language in general. Better relational languages could make UI development more ergonomic and avoid the need for clumsy ORM layers. Also, the prospect of replacing SQL seems more realistic in a domain like frontend UI where SQL hasn't yet taken hold in the first place.

### Building a reactive query system using existing tools is full of technical challenges.

In principle, declarative queries should be a step towards good app perforamnce by default: there need not be a strong coupling bewteen the way that data transformations are described and how they are executed.
The application developer can model the data conceptually, and it is up to the database to find an efficient way to implement the read and write access patterns of the application.
Even a very simple database like SQLite offers a rich suite of tools, like indexes, to respond to those access patterns. Crucially, those tools are largely decoupled from the data model itself, and can even be modified without changing the queries.

We largely have not achieved this vision in practice.
Interestingly, we had only a few problems with slow queries: even when running in the browser using WebAssembly, SQLite is fast enough that most queries with a few joins over a few tens of thousands of rows complete in less than a millisecond.
When we did hit query performance problems, we usually traced them to the limitations of SQLite's [relatively simple query optimizer](https://www.sqlite.org/optoverview.html).
For example, SQLite's optimizer does not optimize across subquery boundaries, but we made extensive use of subqueries to logically decompose our query graph.

In one experiment, we replaced SQLite with [DuckDB](https://duckdb.org/), a relatively young embedded database focussed on analytical query workloads and built using a [state-of-the-art optimizer architecture](https://duckdb.org/why_duckdb#standing-on-the-shoulders-of-giants).
We saw the runtimes of several slow queries drop by a factor of 20, although we also hit problems where DuckDB's optimizer was missing optimizations that we needed.

Outside of the database proper, we encountered a host of technical challenges in making a reactive query system using existing frontend web development tools.
For example, we initially handled queries asychronously in a web worker, but found that that imposed inter-process communication latencies of up to 5 milliseconds.
We traced this to basic properties of the [browser's event loop](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model), and eventually moved the query engine entirely into the UI thread for better performance. [todo: decide how to reconcile this w discussion above]

We also hit many subtle problems while interfacing with React.
TK Geoffrey to write something about hooks

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

While this seems like a purely technical benefit, we also believe that there are conceptual advantages to uniformity in the user interface stack.
Many systems for incremental maintenance work by tracking data _provnenance_: they remember where a particular computation got its inputs, so that it knows when that computation needs to be re-run.
We believe that understanding data provenance is also a fundamental tool in understanding app behaviour, for both app developers trying to debug the app and end users who are trying to extend it.

Imagine a browser-style developer console that allows you to click on a UI element and see what component it was generated from. In a system with end-to-end provenance, we could identify how this element came to be in a much deeper way, answering questions not just questions like "what component template generated this element?" but "what query results caused that component to be included?" and even "what event caused those query results to look this way?".
We saw an early example of this in our query debugger view, but we believe that this can be taken much further. In many ways, data provenance tracking seems like a key step towards fulfilling the vision of [Whyline](https://www.cs.cmu.edu/~NatProg/whyline.html), where any piece of an app can be inspected to determine _why_ it's in that state.

### Where we're going

We started this project wondering how the local-first availability of an app's data could change and simplify app development.
At this point, we're left with more questions than answers.
However, we see the outline of an appraoch where _user interfaces are expressed as queries_, those queries are executed by a fast, performant incremental maintenance system, and that incremental maintenance gives us _detailed data provnenace_ throughout the system.
Together, those ideas seem like they could make app development radically simpler and more accessible, possibly so simple that it could be done "at the speed of thought" by users who aren't skilled in app development.
We're excited by this potential, and even more excited by the possiblity that we might already have the basic technological pieces to make that vision a reality.

---

<SubscriptionBox prompt="If you'd like to follow our work, consider subscribing for updates:" />

We'd love your feedback: we're reachable by email at [feedback@riffle.systems](mailto:feedback@riffle.systems) and on Twitter at [@geoffreylitt](https://twitter.com/geoffreylitt) and [@nschiefer](https://twitter.com/nschiefer)!

*Thanks to TK, TK, TK for feedback*

---

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
