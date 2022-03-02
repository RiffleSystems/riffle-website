---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
  import SubscriptionBox from '../../components/SubscriptionBox.astro'
  import Abstract from '../../components/Abstract.astro'
  import Aside from '../../components/Aside.astro'
  import { Markdown } from "astro/components";
title: Building data-centric apps with a reactive relational database
authors:
  -
    - name: Geoffrey Litt
      link: https://www.geoffreylitt.com/
    - name: Nicholas Schiefer
      link: https://nicholasschiefer.com/
  - name: Johannes Schickling
    link: https://twitter.com/schickling
  - name: Daniel Jackson
    link: http://people.csail.mit.edu/dnj/
publishDate: 2 March 2022
draft: false
description: "We're exploring an approach to simplifying app development: storing all application and UI state in a client-side reactive relational database that provides a structured dataflow model."
previewImage: "assets/essays/prelude/reactive.png"
---

<Abstract>
<Markdown>

Building apps is too hard.
Even skilled programmers who don't specialize in app development struggle to build simple interactive tools.
We think that a lot of what makes app development hard is _managing state_: reacting and propogating the necessary changes as the user takes actions.

We're exploring a new way to manage data in apps by storing all app state--including the state of the UI--in a single reactive _database_.
Instead of imperatively fetching data from the database, the user writes _reactive queries_ that update with fresh results whenever their dependencies change, and the database handles everything else.

As an initial prototype, we have built a reactive layer around SQLite that populates data in a React app, and used it to build a music library app.
We've learned a lot from trying to apply our big vision to a real app: our essays shares some of what we've learned and where we want to take the project next.

Even in our limited prototype, we've found that _thinking of apps as queries over data_ is a powerful frame, opening up new approaches to debugging, persistence, and cross-app interoperability.
We've also learned some hard lessons about the limitations of SQL and the performance challenges of working with data on the web.

Together, our ideas and experiments suggest that we could feasibly take this frame even further.
We sketch a vision for thinking of every layer of an app, from the event log to the pixels on the screen, as pieces of a single large query.
Furthermore, we believe that the key building blocks for building such a system already exist in tools developed for incremental view maintenance and fine-grained data provenance tracking.
While we've just scratched the surface so far, we think that a framework based on these ideas is both possible to build and radically simpler to use.
</Markdown>
</Abstract>

## Introduction

Today, building interactive apps is so hard that it's a specialized skill even among software developers.
Skilled technical computer users, including scientists and systems programmers, struggle to make simple apps, while less technical end-users are disempowered entirely.
Like many other researchers, we'd like to make app development radically more accessible to experts and novices alike.

<p>
Our key hypothesis is that app development is hard in large part because <strong>managing state is hard</strong>.
<Aside>
Here's an interesting thought experiment.
Many software developers think that it is much easier to build command line tools than GUI apps, or even text-user interface (TUI) apps.
Why is that?
<br /><br />
One answer is that command line tools tend to be <em>stateless</em> in between user commands.
A user gives the program some instructions, and it executes them, then discards all of the hidden state before returning control to the user.
In contrast, most apps have some kind of persistent state—often quite a lot—that needs to be maintained and updated as the user takes actions.
</Aside>
Especially in data-centric apps, a large part of the complexity of building and modifying the app comes from managing and propagating state.
In some sense, state management is the main thing that <em>makes an app an app</em>, and distinguishes app development from related tasks like data visualization.
</p>

In a traditional desktop app, state is usually split between app's main memory and external stores like filesystems and embedded databases, which are cumbersome to coordinate.
In a web app, the situation is even worse: the app developer has to thread the state through from the backend database to the frontend and back.
A "simple" web app might use a relational database queried via SQL, an ORM on a backend server, a REST API used via HTTP requests, and objects in a rich client-side application, further manipulated in Javascript:

![](/assets/essays/prelude/layers.png)

The need to work across all these layers results in tremendous complexity. Adding a new feature to an app often requires writing code in many languages at many layers. Understanding the behavior of an entire system requires tracking down code and data dependencies across process and network boundaries. To optimize performance, developers must carefully design caching and indexing strategies at every level.

How might we simplify this stack?

<p>
We think one promising pattern is a <a href="https://www.inkandswitch.com/local-first/"><strong>local-first architecture</strong></a> where all data is stored locally on the client, available to be freely edited at any time, and synchronized across clients whenever a network is available.
<Aside>
In addition to benefits for developers, a local-first architecture also helps end-users by giving them more ownership and control over their own data, and allowing apps to remain usable when the network is spotty or nonexistent.
</Aside>
This architecture <strong>allows rich, low-latency access to application state</strong>, which could unlock totally new patterns for managing state.
If an app developer could rely on a sufficiently powerful <em>local state management layer</em>, then their UI code could just read and write local data, without worrying about synchronizing data, sending API requests, caching, or optimistically applying local updates.
</p>

<p>
This raises the question: what might such a powerful state management layer look like?
It turns out that researchers and engineers have worked for decades on systems that specialize in managing state: databases!
<Aside>
The word &ldquo;database&rdquo; may conjure an image of a specific kind of system, but in this essay we use the word expansively to refer to any system that specializes in managing state. A traditional relational database contains many parts: a storage engine, a query optimizer, a query execution engine, a data model, an access control manager, a concurrency control system, all of which provide different kinds of value. In our view, a system doesn't even need to offer long-term persistence to be called a database.
</Aside>
We think that <strong>many of the technical challenges in client-side application development can be solved by ideas originating in the databases community</strong>.
As a simple example, frontend programmers commonly build data structures tailored to looking up by a particular attribute; databases solve precisely the same problem with <em>indexes</em>, which offer more powerful and automated solutions.
Beyond this simple example, we see great promise in applying more recent research on better relational languages for expressing computations, and incremental view maintenance for efficiently keeping queries updated.
</p>

In the Riffle project, our goal is to apply ideas from local-first software and databases research to radically simplify app development.
In this essay, we start by proposing some [design principles](#principles) for achieving this simplification. We think that a relational model, fast reactivity, and a unified approach to state form a potent trio, which we call the _reactive relational_ model. We've also built a [concrete prototype](#prototype-system-sqlite--react) implementing this idea using SQLite and React, and have used the prototype to build some apps.

So far, we've [found promising signs](#findings) that the reactive relational model can help developers more easily and debug apps, produce better apps for end-users, and offers intriguing possibilites for data-centric interoperability between apps. However, we've also encountered [challenges](#sql-is-a-mediocre-language-for-ui-development) from trying to build toward this vision using existing tools. We conclude by sketching a more [radical approach](#towards-a-more-radical-approach) to representing an entire full-stack application as a single reactive relational query.

## Principles

We started our project with some specific design principles we thought could simplify state management in GUI apps. Each principle draws on extensive prior work in databases and UI development, but we suspected they'd be powerful when combined together in one system.

### Declarative queries clarify application structure

Most applications have some canonical, normalized base state which must be further queried, denormalized, and reshaped before it can populate the user interface. For example, in a music app, if a list of tracks and albums is synced across clients, the UI may need to join across those collections and filter/group the data for display.

In existing app architectures, a large amount of effort and code is expended on collecting and reshaping data.
A traditional web app might first convert from SQL-style tuples to a Ruby object, then to a JSON HTTP-response, and then finally to a frontend Javascript object in the browser.
Each of these transformations is performed separately, and there is often considerable developer effort in threading a new column all the way through these layers.

<p>
In a local-first application, this doesn't need to be the case; all the queries can happen directly within the client. This raises the question: how should those queries be constructed and represented? We suspect that a good answer for many applications is to use a <strong>relational query model</strong> directly within the client UI code.
<Aside>
As we'll discuss throughout this piece, SQL as a specific instantiation of the relational model has some shortcomings. This has often led to adding layers around SQL, like ORMs and GraphQL. However, in principle, a sufficiently ergonomic replacement for SQL could eliminate the need for such additional layers.
</Aside>
Anyone who has worked with a relational database is familiar with the convenience of using declarative queries to express complex reshaping operations on data.
Declarative queries express intent more concisely than imperative code, and allow a query planner to design an efficient execution strategy independently of the app developer's work.
</p>

<figure>
  <img src="/assets/essays/prelude/declarative.png" />
  <figcaption>
    <Markdown>
    A music app stores a list of tracks in a [normalized format](https://en.wikipedia.org/wiki/Database_normalization) with separate tables for tracks and albums, which are related by a foreign key.
    The app reads the data in a joined format so that a user can filter on any track attribute, including the album title.
    The relational query model makes these data dependencies clearer than other approaches, like nested API calls.
    </Markdown>
  </figcaption>
</figure>

This is an uncontroversial stance in backend web development where SQL is commonplace. It's also a typical approach in desktop and mobile development—many complex apps use SQLite as an embedded datastore, including Adobe Lightroom, Apple Photos, Google Chrome, and [Facebook Messenger](https://engineering.fb.com/2020/03/02/data-infrastructure/messenger/).

However, we've observed that the primary use of database queries is to manage _peristence_: that is, storing and retrieving data from disk.
We imagine a more expensive role for the database, where even data that would normally be kept in an in-memory data structure would be logically maintained "in the database".
In this senese, our approach is quite reminiscent of tools like [Datascript](https://github.com/tonsky/datascript), which expose a query interface over in-memory data structures.

In many ways, powerful end-user focused tools like [Airtable](https://www.airtable.com/) are thematically similar: Airtable users express data dependencies in a spreadsheet-like formula language that operates primarily on tables rather than scalar data.
We think relational queries in the client UI is a pattern that deserves to be more widely used.

### Fast reactive queries provide a clean mental model

A *reactive* system tracks dependencies between data and automatically keeps downstream data updated, so that the developer doesn't need to manually propagate change. Frameworks like [React](https://reactjs.org/), [Svelte](https://svelte.dev/), and [Solid](https://www.solidjs.com/) have popularized this style in web UI development, and end-users have built complex reactive programs in spreadsheets for decades.

However, database queries are often not included in the core reactive loop. When a query to a backend database requires an expensive network request, it's impractical to keep a query constantly updated in real-time; instead, database reads and writes are modeled as *side effects* which must interact with the reactive system. Many applications only pull new data when the user makes an explicit request like reloading a page; doing real-time pushes usually requires carefully designing a manual approach to sending diffs between a server and client. This limits the scope of the reactivity: the UI is guaranteed to show the latest local state, but not the latest state from the database.

<p>
In a local-first architecture where queries are much cheaper to run, we can take a different approach. The developer can register <em>reactive queries</em>, where the system guarantees that they will be updated in response to changing data.
<Aside>
This approach is closely related to the <em>document functional reactive programming (DFRP)</em> model introduced in <a href="(https://www.inkandswitch.com/pushpin/">Pushpin</a>, except that we use a relational database rather than a JSON CRDT as our data store, and access them using a query language instead of a frontend language like Javascript.
We can also <a href="https://www.youtube.com/watch?v=_ISAA_Jt9kI">create reactive derived values from our data outside of the tree of UI elements</a>, as in React state management frameworks like <a href="https://jotai.org/">Jotai</a> and <a href="https://recoiljs.org/">Recoil</a>.
<br /><br />
This is also related to cloud reactive datastores like <a href="https://firebase.google.com/">Firebase</a> and <a href="https://www.meteor.com/">Meteor</a>, but storing data on-device rather than on a server enables fundamentally different usage patterns.
</Aside>
Reactive queries can also depend on each other, and the system will decide on an efficient execution order and ensure data remains correctly updated. The UI is now guaranteed to accurately reflect the latest contents of the database at all times.
</p>

<figure>
  <img src="/assets/essays/prelude/reactive.png" />
  <figcaption>
    <Markdown>
    When queries happen locally, they are fast enough to run in the core reactive loop.
    In the span of a single frame (16ms on a 60Hz display, or even 8ms on modern 120Hz display), we have enough time to ① write a new track to the database, ② re-run the queries that change because of that new track, and ③ propagate those updates to the UI.
    From the point of view of the developer and user, there was no intermediate invalid state.
    </Markdown>
  </figcaption>
</figure>

Low latency is a critical property for reactive systems. A small spreadsheet typically updates instantaneously, meaning that the user never needs to worry about stale data; a few seconds of delay when propagating a change would be a different experience altogether. The goal of a UI state management system should be to converge all queries to their new result within a single frame after a write; this means that the developer doesn't need to think about temporarily inconsistent loading states, and the user gets fast software.

<p>
This performance budget is ambitious, but there are reasons to believe it's achievable if we use a local relational database.
<Aside>
As we discussed our ideas with working app developers, we found that many people who work with databases in a web context has an intuition that <em>databases are slow</em>.
This is striking because even primitive databases like SQLite are fast on modern hardware: many of the queries in our demo app run in a few hundred <em>microseconds</em> on a few-years-old laptop.
<br /><br />
We hypothesize this is because developers are used to interacting with databases over the network, where network latencies apply. Also, developer intuitions about database performance were developed when hardware was much slower—modern storage is fast, and many often datasets fit into main memory even on mobile devices. Finally, many relational database management systems aren't built for low latency—many databases are built for analytics workloads on large data sets, where a bit of extra latency is irrelevant to overall performance.
</Aside>
The database community has spent considerable effort making it fast to execute relational queries; many SQLite queries complete in well under one millisecond. Furthermore, there has been substantial work on incrementally maintaining relational queries (e.g., <a href="https://materialize.com/">Materialize</a>, <a href="https://github.com/mit-pdos/noria">Noria</a>, <a href="https://sqlive.io/">SQLive</a>, and <a href="https://github.com/vmware/differential-datalog">Differential Datalog</a> which can make small updates to queries much faster than re-running from scratch.
</p>

### Managing all state in one system provides greater flexibility


Traditionally, ephemeral "UI state," like the content of a text input box, is treated as separate from "application state" like the list of tracks in a music collection. One reason for this is performance characteristics—it would be impractical to have a text input box depend on a network roundtrip, or even blocking on a disk write.

With a fast database close at hand, this split doesn't need to exist. What if we instead combined both "UI state" and "app state" into a single state management system? This unified approach would help with managing a reactive query system—if queries need to react to UI state, then the database needs to somehow be aware of that UI state. Such a system could also present a unified system model to a developer, e.g. allow them to view the entire state of a UI in a debugger.

<figure>
  <img src="/assets/essays/prelude/unified.png" />
  <figcaption>
    <Markdown>
    Conceptually, the state of each UI element is stored in the same reactive database as the normal app state, so the same tools can be used to inspect and modify them.
    This makes it especially easy to manage interactions between UI elements and core objects in the app's domain (e.g., tracks and albums in a music app).
    </Markdown>
  </figcaption>
</figure>

<p>
It would still be essential to configure state along various dimensions: persistence, sharing across users, etc.
<Aside>
Databases are hardly new technology, so it's interesting to wonder about why they've largely not been adopted to manage state in the way that we imagine.
We aren't experts on database history, though, so this is somewhat speculative.
<br /><br />
We pin part of the blame on SQL: as we learned while building our prototype, it's just not terribly ergonomic for many of the tasks in app development.
We also think that there's something of a chicken-and-egg problem.
Because databases don't have the prominent role in app development that we imagine they could, no one appears to have built a database with the right set of performance tradeoffs for app-based workloads.
For example, few databases are optimized for the low latencies that are necessary for interactive apps.
Finally, we think that it might not have been possible to use a database for storing UI-specific, ephermeral state when many modern UI paradigms were developed.
However, modern hardware is just really, really fast, which opens up new architectures.
</Aside>
But in a unified system, these could just be lightweight checkboxes, not entirely different systems.
This would make it easy to decide to persist some UI state, like the currently active tab in an app. UI state could even be shared among clients—in real-time collaborative applications, it's often useful to share cursor position, live per-character text contents, and other state that was traditionally relegated to local UI state.
</p>

## Prototype system: SQLite + React

We built an initial prototype of Riffle: a state manager for web browser apps, implemented as a reactive layer over the SQLite embedded relational database. The reactive layer runs in the UI thread, and sends queries to a SQLite database running locally on-device. For rendering, we use React, which interacts with Riffle via custom hooks.

To run apps in the browser (pictured below), we run the SQLite database in a web worker and persist data to IndexedDB, using [SQL.js](https://sql.js.org) and [absurd-sql](https://github.com/jlongster/absurd-sql). We also have a desktop app version based on [Tauri](https://tauri.studio/) (an Electron competitor that uses native webviews instead of bundling Chromium); in that architecture we run the frontend UI in a webview and run SQLite in a native process, persisting to the device filesystem.

![](/assets/essays/prelude/prototype.png)

For this prototype, our goal was to rapidly explore the experience of building with local data, so we reduced scope by building a _local-only_ prototype which doesn't actually do multi-device sync. Syncing a SQLite database across devices is a problem others have already solved (e.g., James Long's CRDT-based approach in [Actual Budget](https://archive.jlongster.com/using-crdts-in-the-wild)) so we're confident it can be done. We also have further ideas for thoughtfully designing sync systems which we'll share in our next essay.

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

Once we’ve written this query, we’ve already done most of the work for showing this particular UI. We can simply extract the results and use a JSX template in a React component to render the data. Here's a simplified code snippet:

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
      <th>Name</th><th>Album</th><th>Artist</th>
    </thead>
    <tbody>
      {tracks.map(track => <tr>
        <td>{track.name}</td><td>{track.album}</td><td>{track.artist}</td>
      </tr>)}
    </tbody>
  </table>
}
```

We can also represent this component visually. Currently it contains a single SQL query which depends on some global app state tables, as well as a view template.

![](/assets/essays/prelude/component-1.png)

The UI looks like this:

![](/assets/essays/prelude/tracklist.png)

<p>
Importantly, this query doesn’t just execute once when the app boots. It’s a <strong>reactive query</strong>, so any time the relevant contents of the database change, the component will re-render with the new results.
<Aside>
Currently our prototype implements a naive reactivity approach: re-running all queries from scratch any time their dependencies change. This still turns out to usually be fast enough because SQLite can run many common queries in under 1 millisecond.
</Aside>
For example, when we add a new track to the database, the list updates automatically.
</p>

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
import { useComponentState } from 'riffle'

const TrackListSchema = {
  componentType: "TrackList",
  columns: {
    sortProperty: "string",
    sortDirection: "string"
  }
}

const TrackList = () => {
  const [state, set] = useComponentState(TrackListSchema, { key: "singleton" })
  const tracks = useQuery(tracksQuery)

  return <table>
    <thead>
      <th onClick={set.sortProperty("name")}>Name></th>
      <th onClick={set.sortProperty("album_name")}>Album></th>
      <th onClick={set.sortProperty("artists")}>Artists</th>
    </thead>
     <tbody>
        {tracks.map(track => <tr>
          <td>{track.name}</td><td>{track.album}</td><td>{track.artist}</td>
        </tr>)}
      </tbody>
  </table>
}
```

<p>
Next, we need to actually use this state to sort the tracks.
<Aside>
This query doesn't just read the current value; it creates a reactive dependency.
It's a bit hard to read because we're relying on string interpolation, since SQLite's dialect of SQL has no way to dynamically control the sort order using a relation.
With a different language than SQL, one could imagine writing this in a more relational way that doesn't involve string interpolation at all.
</Aside>
We can interpolate the sort property and sort order into a SQL query that fetches the tracks:
</p>

```jsx
// Define SQL query for sorted tracks based on original tracks query
const sortedTracks = db.query((get) => sql`
select *
from (${get(tracksQuery.queryString)}) -- use tracks as a subquery
  order by ${get(state.sortProperty)} ${get(state.sortOrder)}
`)
```

This new query for sorted tracks depends on the local component state, as well as the original tracks query:

![](/assets/essays/prelude/component-2.png)

Now if we populate the list of tracks from this query, when we click the table headers, we see the table reactively update:

<video controls="controls" muted="muted" src="/assets/essays/prelude/sort.mp4" playsinline="" />

Of course, this is functionality that would be easy to build in a normal React app. What have we actually gained by taking the Riffle approach here?

First, it's **simpler to understand** what's going on in the system, because the system has structured dataflow at runtime which exposes the provenance of computations. If we want to know why the tracks are showing up the way they are, we can inspect a query, and transitively inspect that query’s dependencies, just like in a spreadsheet.

Second, we can achieve more **efficient execution** by pushing computations down into a database. For example, we can maintain indexes in a database to avoid the need to sort data in application code, or manually maintain ad hoc indexes.

Finally, UI state is **persistent by default**. It’s often convenient for end-users to have state like sort order or scroll position persisted, but it takes active work for app developers to add these kinds of features. In Riffle, persistence comes for free, although ephemeral state is still easily achievable by setting up component keys accordingly.

### Full text search

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

![](/assets/essays/prelude/component-3.png)

Now, when the user types into the search box, their search term appears and filters the list of tracks:

<video controls="controls" muted="muted" src="/assets/essays/prelude/search.mp4" playsinline="" />

Interestingly, because we’re using a controlled component, every keystroke the user types must round trip through the Riffle database before it is shown on the screen, which imposes tight constraints on database latency: ideally we want to finish updating the input and all its downstream dependencies within a few milliseconds.

It's unusual to send user input through the database before showing it on the screen, but there’s a major advantage to this approach. If we can consistently achieve this performance budget and refresh our reactive queries *synchronously*, the application becomes easier to reason about, because it always shows a single consistent state at any point in time. For example, we don’t need to worry about handling the case where the input text has changed but the rest of the application hasn’t reacted yet.

In our experience so far, SQLite can run most queries fast enough to make this approach work. (We discuss what can be done in cases where it isn't fast enough [later](#findings).) As another example of how fast a local datastore can be, we can store the currently selected track in the database. Selecting tracks with the mouse or keyboard feels responsive, even though it's round-tripping through the database every time the selection changes:

<video controls="controls" muted="muted" src="/assets/essays/prelude/selection.mp4" playsinline="" />

### Virtualized list rendering

Personal music collections can get large—it’s not uncommon for one person to collect hundreds of thousands of songs over time. With a large collection, it’s too slow to render all the rows of the list to the DOM, so we need to use *virtualized* list rendering: only putting the actually visible rows into the DOM, with some buffer above and below.

<Aside>
In our current prototype, we had to throttle database writes so the new scroll state only gets written to the database once every 50ms. In <a href="#performance-is-a-challenge-with-existing-tools">our findings</a> we discuss sources of these performance limitations in the prototype; in a future system it would be better to remove this throttling.
</Aside>

With Riffle, implementing a simple virtualized list view from scratch only takes a few lines of code. We start by representing the current scroll position in the list as a new state column on the track list component, `scrollIndex`. As the user scrolls, we use an event handler on the DOM to update this value, essentially mirroring the stateful scroll position of the DOM into the database.

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

const filteredPagedTracks = db.query((get) => {
  const startIx = parseInt(get(state.scrollIndex)) - PAGE_BUFFER
  return sql`
    select * from ${filteredTracks} as tracks
    limit ${PAGE_SIZE + (2 * PAGE_BUFFER)} offset ${startIx}
  `
},
```
This simple approach to virtualized list rendering turns out to be fast enough to support rapid scrolling over a large collection of tracks:

<video controls="controls" muted="muted" src="/assets/essays/prelude/scroll.mp4" playsinline="" />

 Because all the data is available locally and we can query it quickly, we don’t need to reason about manual caches or downloading paginated batches of data; we can simply declaratively query for the data we want given the current state of the view.

### Editing data across apps

One possibility we found particularly intriguing about our prototype was the ability to edit data across apps, using the database as an intermediary.

When using the desktop version of our app, the database is stored in a SQLite file on disk which can be opened in a generic SQL tool like [TablePlus](https://tableplus.com/). This is helpful for debugging, but we can go further: we can even _modify the UI state_ of the app from the generic tool, e.g. changing the search term or sort order. In the video below, we can see the UI reacts as the database contents change.

<video controls="controls" muted="muted" src="/assets/essays/prelude/interop.mp4" playsinline="" />

<Aside>
In TablePlus, the user must explicitly commit each change by pressing Cmd+S; the music app reacts quickly after the user commits the change.
</Aside>

Of course, this modification could be done programmatically by a script or an alternate UI, rather than a person manually using a generic tool. By putting UI state in the database, we've effectively created a data-centric scripting API for interacting with the application.

We've also explored this idea for integrating with external services.
We've built features for playing music on Spotify; normally this would involve the application making imperative calls to the Spotify API.
However, these imperative calls are tricky: for example, they implicitly depend on the order in which things happen, and that order is poorly defined in an asynchronous environment.
Instead we've tried to model this as a problem of shared state: both our application and Spotify are reading/writing from the same SQLite database.
When the user performs an action, we write that action to the database as an event, which is then synced by a background daemon using the imperative Spotify APIs.
Conversely, when something happens in Spotify, we write an event to our local database, and the app updates reactively as it would with an app-created write.
We discuss this unconventional approach to interoperability [below](#data-based-interoperability-offers-advantages-over-action-based-apis).

### Building a complex app?

So far we've shown a very simple example, but how does this approach actually scale up to a more complex app? To answer this question, [one of us](https://twitter.com/schickling) has been using a version of Riffle to build a full-featured music manager application called MyTunes, which has richer UI for playlists, albums, artists, current play state, and more. Here's a preview of what it looks like currently:

![](/assets/essays/prelude/mytunes.png)

So far, it appears that the basic model is viable, but much work remains to make the experience pleasant for an application developer. One challenge has been integrating Riffle's reactive queries with React's own reactivity in a way that doesn't create confusion for a developer. Another challenge has been maintaining low latency even as the app grows in complexity. Finally, there are many details we're still working on which aren't essential to the idea but which matter greatly for the developer experience, including API design, static types for query results, schema and migration management.

## Findings

Overall, working with our prototype system made us optimistic that this is a promising direction for simplifying application development. At the same time, it also clarified some of the challenges to making this approach truly work. Here are some of our reflections.

### Structured queries make it easier to understand an app

The Riffle model produces a highly structured app. Each component contains:

- local relational **state**
- reactive **queries** that transform data
- a **view template** for rendering DOM nodes and registering event handlers

These components are organized into a tree, where components can pass down access to their queries (and state) to their children:

![](/assets/essays/prelude/component-tree.png)

In some sense, the view template is also a "query": it's a pure function of the data returned by the queries, and its expressed in a declarative, rather than imperative style!
So, we can view the queries and template together as a large, tree-structured view of the data—the sources are the base tables, the sinks are the DOM templates, and the two are connected by a tree of queries. All dependencies are known by the system at runtime.

![](/assets/essays/prelude/query-graph.png)

In general, we found that thinking about our app in these terms made it easier to reason about behavior. You could imagine the pictures above being shown live as a visual debugger view. We spent a few days prototyping a very primitive debugger:
</p>

<figure>
  <img src="/assets/essays/prelude/debugger.png" />
  <figcaption>
    <Markdown>
      This debugger pane shows ① on the left, a list of various database tables (spanning both app state and UI state), ② in the middle, live views of tabular data, ③ on the right, live views of SQL queries which are being dynamically generated at runtime.
    </Markdown>
  </figcaption>
</figure>

Even this basic debugger proved highly useful, because it enabled us to ask "why is this UI element showing up this way?", and trace back the chain of computations through the tree of queries. It reminded us of debugging a spreadsheet, where pure formulas can always explain  the contents of the sheet. Since our queries are tightly bound to UI components, being able to look at the "data behind the UI" made it much easier to hunt down the particular step in the transformation pipeline that had the bug.

<p>
This debugger UI isn't yet rich enough to fully deliver on the promise, but we're optimistic that the underlying structure of the state model will make it easier to develop full-featured debug views.
<Aside>
One example of a thoughtful interface for debugging in a dataflow graph is <a href="https://observablehq.com/@observablehq/introducing-visual-dataflow">Observable's dependency visualization.</a>
</Aside>
</p>

It's interesting to compare this set-wise debugging from debuggers in imperative programs.
Imperative debuggers can iterate through a for-loop (or equivalently, a map) but we usually don't see all the data at once.
The pervasive use of relational queries seems to be a better fit for debugging data-intensive programs, although we feel that we've only scratched the surface of the problem.

### Users and developers benefit from unified state

We found it nice to treat all data, whether ephemeral "UI data" or persistent "app data", in a uniform way, and to think of persistence as a lightweight property of some data, rather than a foundational part of the data model.

We were frequently (and unexpectedly) delighted by the persistent-by-default UI state.
In most apps, closing a window is a destructive operation, but we found ourselves delighted to restart the app and find ourselves looking at the same playlist that we were looking at before. It made closing or otherwise "losing" the window feel much safer to us as end-users.

Admittedly, this persistence was also frustrating to us as developers at times: restarting the app didn't work as well when the buggy UI state persisted between runs.
We often found ourselves digging through the database to delete the offending rows.
This did lead to another observation, though: in this model, we can decouple _restarting the app_ from _resetting the state_. Since the system is entirely reactive, we could reset the UI state completely without closing the app.

Another challenge was fitting compound UI state like nested objects or sequences into the relational model. For now, we've addressed this challenge by serializing this kind of state into a single scalar value within the relational database. However, this approach feels haphazard, and it seems important to find more ergonomic relational patterns for storing common kinds of UI state.

### Migrations are a challenge

In our experience, migrations are a consistent pain when working with SQL databases.
However, our prototype created entirely new levels of pain because of the frequency with which our schema changed.

<p>
In a more traditional architecture, state that's managed by the frontend gets automatically discarded every time the program is re-run.
Our prototype stores all state, including ephemeral UI state that would normally live exclusively in the main object graph, in the database, so any change to the layout of that ephemeral state forced a migration.
<Aside>
This problem is reminiscent of some of the challenges of Smalltalk images, where code was combined with state snapshots.
</Aside>
In most cases, we chose to simply delete the relevant tables and recreate them while in development, which essentially recreates the traditional workflow with ephemeral state.
</p>

Of course, Riffle is not the first system to struggle with migrations; indeed, one of us has already done [extensive work on migrations for local-first software](https://www.inkandswitch.com/cambria/).
We believe that making migrations simpler and more ergonomic is a key requirement for making database-managed state as ergonomic as frontend-managed state.

### SQL is a mediocre language for UI development

We were initially very enthusiastic about unlocking the power of SQL in a web app. We found a lot to like in SQL: the relational model provides a lot of advantages, query optimizers are very powerful, and a large number of people, including many who aren’t “software developers” can understand and even write it.

Nonetheless, SQL was a consistent thorn in our side during this project. The deficiencies of SQL are [well-known](https://www.scattered-thoughts.net/writing/against-sql), so we won’t belabor them here. A few key pain points for us were:

<ol>
<li>
Standard SQL doesn’t support nesting, even in the projection step (i.e., what describes the shape of the results).
<Aside>
There are various extensions to SQL that support nesting, but many of them are not that good and the good ones are not widely available.
</Aside>
We’re big fans of data normalization, but it’s very convenient to nest data when producing outputs.
</li>

<li>
SQL syntax is verbose and non-uniform. SQL makes the hard things possible, but the simple things aren’t easy. Often, making small changes to the query requires rewriting it completely.
</li>
<li>
SQL’s scalar expression language is weird and limited. Often, we wanted to factor out a scalar expression for re-use, but doing this in SQLite was annoying enough that we didn’t do it often.
</li>
<li>
SQL doesn't have good tools for metaprogramming and changing the shape of a query at runtime: e.g., adding or removing a `where` filter clause depending on some data in the database. This forced us to often resort to using JavaScript string interpolation.
</li>
</ol>

We view these issues as shortcomings of *SQL in particular*, and not the idea of a relational query language in general. Better relational languages could make UI development more ergonomic and avoid the need for clumsy ORM layers. Also, the prospect of replacing SQL seems more realistic in a domain like frontend UI where SQL hasn't yet taken hold in the first place.

While we tried to stick to well-known technologies like SQL in our prototype, we are excited about the potential of newer relational languages like [Imp](https://github.com/jamii/imp/tree/v1) and Datalog.

### Performance is a challenge with existing tools

In principle, declarative queries should be a step towards good app performance by default. The application developer can model the data conceptually, and it is up to the database to find an efficient way to implement the read and write access patterns of the application. In practice, our results have been mixed.

<aside>
<Markdown>

</Markdown>
</aside>

<p>
On the bright side, the core database itself has been mostly fast.
<Aside>
 We've traced slow queries back to the limitations of SQLite's <a href="https://www.sqlite.org/optoverview.html">query optimizer</a>. For example, it doesn't optimize across subquery boundaries, but we made extensive use of subqueries to modularize our queries. Also, it only does simple nested loop joins, which can be slow for joins on large tables. As an experiment, we tried replacing SQLite with <a href="https://duckdb.org/">DuckDB</a>, a newer embedded database focused on analytical query workloads with a <a href="https://duckdb.org/why_duckdb#standing-on-the-shoulders-of-giants">state-of-the-art optimizer</a>. We saw the runtimes of several slow queries drop by a factor of 20, but some other queries got slower because of known limitations in their current optimizer. Ultimately we plan to explore incremental view maintenance techniques so that a typical app very rarely needs to consider slow queries or caching techniques.
</Aside>
Even running in the browser using WebAssembly, SQLite is fast enough that most queries with a few joins over a few tens of thousands of rows complete in less than a millisecond. We've had some limited exceptions, which we've worked around for now by creating materialized views which are recomputed outside of the main synchronous reactive loop.
</p>

However, outside of the database proper, we've encountered challenges in making a reactive query system that integrates well with existing frontend web development tools in a performant way.

One challenge has been inter-process communication. When the reactive graph is running in the UI thread and the SQLite database is on a web worker or native process, each query results in an asynchronous call that has to serialize and deserialize data. When trying to run dozens of fast queries within a single animation frame, we've found that this overhead can become a major source of latency. One solution we're exploring is to synchronously run SQLite in the UI thread, and to asynchronously mirror changes to a persistent database.


<p>
Another challenge has been integrating with React. In an ideal world, a write would result in Riffle fully atomically updating the query graph in a single pass, and minimally updating all the relevant templates.
<Aside>
Some React alternatives like <a href="https://svelte.dev/">Svelte</a> and <a href="https://www.solidjs.com/">SolidJS</a> take a different approach: tracking fine-grained dependencies (either at compile-time or runtime) rather than diffing a virtual DOM. We think this style of reactivity could be a good fit for Riffle, but for now we've chosen to prototype with React because it's the UI framework we're most familiar with.
</Aside>
However, to preserve idiomatic React patterns (like passing component dependencies using props), we've found that it sometimes takes a few passes to respond to an update—a write occurs, Riffle queries update, React renders the UI tree and passes down new props, Riffle queries are updated with new parameters, then React renders the tree again, and so on. We're still finding the best patterns to integrate with React in a fast and unsurprising way.
</p>

Rendering to the DOM has been another source of performance problems. We've seen cases where the data for a playlist of tracks can be loaded in <1ms, but the browser takes hundreds of milliseconds to compute the CSS styles and layout.

We think there are reasonable solutions to each of these performance challenges in isolation, but we suspect the best solution is a more integrated system that doesn't build on existing layers like SQlite and React.

### Data-based interoperability offers advantages over action-based APIs.

Since the introduction of object-oriented programming, most interoperability has been “verb-based”: that is, based on having programs call into each other using APIs. Indeed, new programmers are often taught to hide data behind APIs as much as possible in order to encapsulate state.

In our prototype, we found dramatic benefits to turning this paradigm on its head. Instead of using verb-based APIs for interoperability, we used *shared data representations* to create “noun-based” interoperability surfaces. We observed three major advantages to this approach.

First, we found it very decouple read- and write-paths: the source application can write the data in a convenient format, while the target application can query it to obtain data in a different convenient format. Often, the most convenient write path is an event log, but consuming an event log is quite difficult for other apps.

Second, <a href="https://twitter.com/andy_matuschak/status/1452438198668328960">verb-based APIs create an unfortunate n-to-n problem</a>: every app needs to know how to call the APIs of every other app. In contrast, data-based interoperability can use the shared data directly: once an app knows how to read a data format, it can read that data regardless of which app produced it.

Third, we found that treating the data format as a core interface for an app solves many problems that are plague modern apps. Many users who are familiar with standard UNIX tools and conventions speak wistfully of “plain text” data formats, despite its disadvantages. We feel that plain text is an unfortunate way to store data in general, but recognize what these users long for: a source of truth that is *legible* outside of the application, possibly in ways that the application developer never anticipated. As we saw in our TablePlus demo, data-based interoperability provides these advantages while also providing the advantages of a structured file format.

## Towards a more radical approach

So far, we've argued that using reactive relational queries to store and reshape data in an app has simplified the stack. However, if we zoom out and look at all the steps involved in building an app, we'll realize that we've actually only addressed one slice of the problem so far.

In this section, we zoom out and describe a more radical approach to spreading reactive relational queries further up and down the stack. These ideas are more speculative and we haven't yet substantiated them with concrete implementations, but we think they're worth pursuing.

### View templates as queries

So far, in our prototype, we've delegated rendering to React. The database's responsibility ends at updating derived data views; React is responsible for rendering those into view templates and applying updates to the DOM:

![](/assets/essays/prelude/pipeline-1.png)

This has been great for rapid prototyping, but the combination of these two systems causes problems. It's harder to understand behavior as a whole, and the system is slower than it needs to be. What if we removed React (or any other rendering library) from the stack, and used reactive relational queries to directly render view templates?

![](/assets/essays/prelude/pipeline-2.png)

It's difficult to imagine doing this in a language like SQL, but with a different relational language and a careful approach to templating, it's plausible. Jamie Brandon has explored this direction in his work on [Relational UI](https://www.scattered-thoughts.net/writing/relational-ui/).

### CRDTs as queries

There's yet another part of the stack that we've mostly ignored in this essay. In many collaborative apps, we need to turn _events_ representing user actions into some _base state_ that's seen by all users. One common approach to this step is to use [Conflict-Free Replicated Data Types](https://crdt.tech/) (CRDTs), which ensure that all users see the same state even if their events got applied in different orders:

![](/assets/essays/prelude/pipeline-3.png)

Typically, CRDTs are developed for maintaining specific kinds of data structures, by reasoning very carefully about commutativity properties. However, there's an elegant idea of representing CRDTs in a more general way: as a declarative, relational query that turns a set of events into a final state—as seen in Martin Kleppmann's [implementation of a text CRDT using Datalog](https://martin.kleppmann.com/2018/02/26/dagstuhl-data-consistency.html). This suggests it might be possible to subsume CRDTs into the full-stack relational query as well:

![](/assets/essays/prelude/pipeline-4.png)

Taken to the extreme, we've ended up with a strange model of an interactive app, as a sort of full-stack query. Users take actions that are added to an unordered set of events, and then the DOM minimally updates in response. The entire computation in between is handled by a single relational query.

### What might compressing the stack into a query get us?

This may seem like an elegant concept, but there's a natural question of whether it would actually lead to any progress in our quest to make app development simpler, faster, and more powerful. We think that the key benefit would be making it _easier to reason across layers of the stack._

For example, let's consider performance.
Users are [exquisitely](https://www.inkandswitch.com/slow-software/) [sensitive](https://danluu.com/input-lag/) to even small amounts of latency, and we believe that low latency is a key property of the types of creative tools that we're excited about.
A key challenge in building performant apps is performing _incremental updates_: it's often much easier to describe how to build the UI from scratch than to figure out how it must update in response to a new event, but it's often too expensive to rebuild the UI from scratch every frame as in immediate-mode GUI tools.
Indeed, a key lesson from React and other virtual DOM-based tools is finding a way to automatically transform a build-from-scratch description of the UI into an incremental one.

<p>
In the past twenty years, researchers in the programming languages and database communities have developed various tools for automatically incrementalizing computation.
Many of these techniques are attempts to solve the <em>incremental view maintenance</em> problem for relational databases, where a view of the data is dynamically maintained as new writes occur.
<Aside>
Incremental view maintenance is the problem of updating the results of a query over some data as it changes.
Simple indexes can be viewed as a sort of view--the data sorted by the index key--that is especially easy to maintain.
The basic problem has been <a href="http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.40.2254&rep=rep1&type=pdf">studied</a> <a href="https://wiki.postgresql.org/wiki/Incremental_View_Maintenance">for</a> <a href="http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.31.3208&rep=rep1&type=pdf">decades</a> in the database research community.
Recently, new approaches to the incremental view maintenance problem have drawn from general incremental computing frameworks, like <a href="https://github.com/frankmcsherry/differential-dataflow">differential dataflow</a>.
</Aside>
</p>

If the UI can be expressed in a way that is friendly to one of these automated incremental maintenance, perhaps as a declarative view of the data, we might be able to express user interfaces in a declarative, build-from-scratch way but obtain the performance benefits of incremental updates.
Other efforts in this space, like the [Incremental](https://opensource.janestreet.com/incremental/) and [inc-dom](https://www.janestreet.com/tech-talks/intro-to-incr-dom/) libraries, have shown considerable success in these directions.

While this seems like a purely technical benefit, we also believe that there are conceptual advantages to uniformity in the user interface stack.
Many systems for incremental maintenance work by tracking data _provenance_: they remember where a particular computation got its inputs, so that it knows when that computation needs to be re-run.
We believe that understanding data provenance is also a fundamental tool in understanding app behavior, for both app developers trying to debug the app and end users who are trying to extend it.

Imagine a browser-style developer console that allows you to click on a UI element and see what component it was generated from. In a system with end-to-end provenance, we could identify how this element came to be in a much deeper way, answering questions not just questions like "what component template generated this element?" but "what query results caused that component to be included?" and even "what event caused those query results to look this way?".
We saw an early example of this in our query debugger view, but we believe that this can be taken much further. In many ways, data provenance tracking seems like a key step towards fulfilling the vision of [Whyline](https://www.cs.cmu.edu/~NatProg/whyline.html), where any piece of an app can be inspected to determine _why_ it's in that state.

### Where we're going

We started this project wondering how the local-first availability of an app's data could change and simplify app development.
At this point, we're left with more questions than answers.
However, we see the outline of an approach where _user interfaces are expressed as queries_, those queries are executed by a fast, performant incremental maintenance system, and that incremental maintenance gives us _detailed data provenance_ throughout the system.
Together, those ideas seem like they could make app development radically simpler and more accessible, possibly so simple that it could be done "at the speed of thought" by users who aren't skilled in app development.

<p>
We find a lot of inspiration from tools like spreadsheets, arguably the origin of the reactive programming model, and Airtable, which draws inspiration from the relational model.
<Aside>
Airtable is by far the most polished expression of the relational model in a tool aimed at end users.
In our experience, users with no technical background besides computer office skills can be highly productive in Airtable after just a few months.
Nonetheless, Airtable has some significant limitations. Its query facilities are limited to what can be expressed in the view UI, and don&rsquo;t come close to expressing the full power of relational queries—for instance, it doesn&rsquo;t support general joins, or even nested filter predicates. Also, its performance degrades rapidly when a single database approaches the kinds of medium-sized data sets that we are most interested in, and it has a <a href="https://support.airtable.com/hc/en-us/articles/115010928147-Airtable-plans">hard limit of 50,000 records per base</a>.
</Aside>
These tools are highly productive in their domains; in our experience, they are <em>more productive</em> than traditional developer tools even for skilled software engineers.
Nonetheless, they have significant technical and conceptual limitations; you can&rsquo;t use Airtable to write iTunes.
We hope that by taking a step back and developing some key abstractions, we can achieve the full expressive power of &ldquo;general purpose&rdquo; programming tools and simplify them dramatically, for experts and novices alike.
</p>

We're excited by this potential, and even more excited by the possibility that we might already have the basic technological pieces to make that vision a reality.

---

<SubscriptionBox prompt="If you'd like to follow our work, consider subscribing for updates:" />

We'd love your feedback: we're reachable by email at [glitt@mit.edu](mailto:glitt@mit.edu) and [schiefer@mit.edu](mailto:schiefer@mit.edu), and on Twitter at [@geoffreylitt](https://twitter.com/geoffreylitt) and [@nschiefer](https://twitter.com/nschiefer)!

*We're grateful for helpful feedback from Jamie Brandon, Sam Broner, Mike Cafarella, Adam Chlipala, Jonathan Edwards, Josh Horowitz, Adam Jermyn, David Karger, Martin Kleppmann, Kevin Lynagh, Sam Madden, Rob Miller, Josh Pollock, Jalex Stark, Michael Stonebraker, Peter van Hardenberg, the MIT Software Design Group, and the MIT Data Systems Group as we developed the ideas in this essay.
Geoffrey Litt was supported by an NSF GRFP Fellowship.
Nicholas Schiefer was supported by a Simons Investigator Award.*
