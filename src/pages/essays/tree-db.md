---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
title: |
  Merge What You Can, Fork What You Can’t:
  Managing Data Integrity in Local-First Software
authors:
  -
    - name: Geoffrey Litt
      link: https://www.geoffreylitt.com/
    - name: Nicholas Schiefer
      link: https://nicholasschiefer.com/
  - name: Daniel Jackson
    link: http://people.csail.mit.edu/dnj/
publishDate: 5 Apr 2022
draft: false
description:
---

<h1 id="sec:introduction">Introduction</h1>
    <p>
      Local-first software
      <span class="citation" data-cites="kleppmann2019"
        >[<a href="#ref-kleppmann2019" role="doc-biblioref">8</a>]</span
      >
      prioritizes availability: users can freely access and modify data locally
      on a client device, then optionally synchronize that data with other
      devices when connected to a network. This architecture enables offline
      access, low latency UIs, and other benefits for users, but also introduces
      challenges around data consistency, since users may concurrently make
      incompatible edits that must be reconciled.
    </p>
    <p>
      There are a variety of existing approaches that help application
      developers grapple with this challenge. For example, Conflict-Free
      Replicated Data Types (CRDTs)
      <span class="citation" data-cites="shapiro2011 preguica2018"
        >[<a href="#ref-preguica2018" role="doc-biblioref">12</a>,<a
          href="#ref-shapiro2011"
          role="doc-biblioref"
          >13</a
        >]</span
      >
      avoid conflicts entirely by modeling data in terms of commutative
      operations. Meanwhile, systems like Bayou
      <span class="citation" data-cites="terry1995"
        >[<a href="#ref-terry1995" role="doc-biblioref">14</a>]</span
      >
      and Ice Cube
      <span class="citation" data-cites="kermarrec2001"
        >[<a href="#ref-kermarrec2001" role="doc-biblioref">7</a>]</span
      >
      allow developers to specify application-specific logic for detecting and
      resolving conflicts. Other systems like Diamond
      <span class="citation" data-cites="zhang"
        >[<a href="#ref-zhang" role="doc-biblioref">15</a>]</span
      >
      abandon complete local control and provide only limited offline
      functionality. While these approaches differ in the details of the model
      they expose to developers, they share a fundamental goal: to ensure that
      all replicas converge to the same state as quickly as possible given
      network availability and to maximally preserve user intent.
    </p>
    <h4 id="digital-gardens-pose-unique-sync-challenges.">
      Digital gardens pose unique sync challenges.
    </h4>
    <p>
      While existing techniques have proven useful in many contexts, we argue
      that they do not offer good solutions for a large class of applications we
      call <em>digital gardens</em>, which include media library managers for
      photos, music, books, and academic references; personal knowledge
      management tools for taking and organizing notes; and even filesystem
      browsers. Digital gardens grow over time, often containing large volumes
      of data that make it hard for a user to manually audit the state of the
      system. Digital gardens also manage immensely valuable personal data,
      where data integrity is paramount.
    </p>
    <p>
      This combination of features makes it difficult to sync data in a digital
      garden application. If the system merges changes in an undesirable way,
      the problem can be hard to detect and can have catastrophic long-lasting
      implications. Meanwhile, in order to avoid a tedious user experience, it
      is essential that unrelated changes are still merged automatically without
      manual action by the user. In Section 2 we demonstrate this tension with
      an example scenario of two users editing a shared photo library.
    </p>
<p>
      This problem seems fundamental, but it relates to a key assumption made by
      most data sync systems about consistency: that all users should see a
      single shared state as soon as possible. We argue that this property is
      not essential in digital gardens—although users typically want to
      <em>eventually</em> converge to a single consistent view, they can accept
      extended periods where they see different views instead. This is familiar
      to any programmer who has used a version control system like Git: the
      process of synchronizing changes is not tightly coupled to merging those
      changes into a single history. By relaxing the assumption that end-users
      would like to converge immediately upon syncing, we can imagine new
      strategies for synchronization.
    </p>
    <h4 id="achieving-data-integrity-with-forking-histories.">
      Achieving data integrity with forking histories.
    </h4>
    <p>
      We propose <em>forking histories</em>: a new model where a synchronization
      layer could expose <em>multiple</em> co-existing states to the user
      through the application layer. This would enable entirely new techniques
      for managing concurrent writes—changes could still be automatically merged
      when possible, but conflicts could result in forking histories which users
      could inspect, edit, and manually merge back together. It would allow for
      maintaining strong consistency within each history, avoiding problematic
      merges. At the same time, users could continue to make progress on any
      history, not just the primary one, and have control over when to do the
      work of resolving conflicts.
    </p>
    <p>
      In effect, we decouple the physical and logical synchronization processes:
      one replica can receive write events from another and access them if
      needed, without reconciling them with the local changes. Instead, we defer
      the logical reconciliation until the user is ready to perform it, without
      needing to take the device offline. We believe this unconventional model
      could present an attractive set of tradeoffs in the context of digital
      garden applications; we elaborate further on this claim in Section 3.
    </p>
        <h4 id="treedb-an-instance-of-forking-histories.">TreeDB: an instance of forking histories.</h4>
<p>
      To concretely illustrate how this idea might work in practice, in
      Section 4 we describe the design of a proposed synchronization system
      called TreeDB that implements the forking history model. Instead of
      computing a single consistent state across replicas, we compute a shared
      tree of reified write events that represents <em>multiple</em> possible
      histories, each one internally consistent and satisfying
      application-specific integrity constraints. The system can play any
      history into a materialized state and expose it to the application, so
      users can view any of the forking histories and not just the “primary”
      one. Furthermore, users can choose to manually resolve conflicts by
      patching up the tree and moving events across histories, but they can also
      defer conflict resolution and continue working on a separate state of the
      application.
    </p>
    <p>
      TreeDB generalizes the event log structure of distributed version control
      systems like Git. It expresses its conflicts using <em>conflict sets</em>,
      a conflict model found in consistent distributed systems with optimistic
      and multi-version concurrency control
      <span class="citation" data-cites="kung1981 bernstein1987 zhou2021"
        >[<a href="#ref-bernstein1987" role="doc-biblioref">2</a>,<a
          href="#ref-kung1981"
          role="doc-biblioref"
          >9</a
        >,<a href="#ref-zhou2021" role="doc-biblioref">16</a>]</span
      >. The system maintains a key property of eventual consistency: regardless
      of the order in which the events are received at different nodes, all
      nodes will eventually agree on the placement of events in the tree. We
      discuss this property in more detail in Section 4.3.
    </p>
    <p>
      TreeDB’s events are sufficiently general that they can be used to
      implement other approaches to conflict detection and resolution—for
      example, commutative operations can be used to lower the frequency of
      conflicts, even to the point that the system <em>always</em> converges to
      a single history. In Section 5.1.1.1, we show how simple CRDTs can be
      simulated in TreeDB. TreeDB can also be seen as an adaptation of Git’s
      commit graph to non-textual structured data; we also discuss this
      relationship in Section 5.1.1.2.
    </p>
    <p>
      It remains to be seen if forking histories can be made ergonomic enough
      for end-users to understand in the context of a real application. We
      suspect that careful user interface design can enable users to reason
      about forking histories, and that TreeDB—or perhaps a similar
      system—provides critical properties for local-first digital gardens.
    </p>
<h1 id="sec:sync-challenges">Sync challenges in digital gardens</h1>
    <p>
      Consider an application like Apple Photos or Adobe Lightroom that helps a
      dedicated photographer manage and organize their photo library. This
      application has several characteristics that distinguish it from other
      kinds of software.
    </p>
    <p>
      <strong>Accretion over time</strong>: A photo library manages data that
      <em>grows over time</em>. Several of the authors manage photos libraries
      that span over multiple decades, and the value of decade-old photos is no
      less than that of photos taken last week. In contrast, data from old
      projects is usually not of critical importance in a project tracker: the
      current state of the task list is really what matters.
    </p>
    <p>
      <strong>Unbounded workflows</strong>: Photo managers also handle workflows
      that are <em>unbounded in scope</em>. Once a user finishes writing a
      paper, the feedback they received from editors during the writing process
      becomes irrelevant, because the writing process ends at some discrete
      moment. In contrast, the scope of what a user might want to do with their
      photos expands indefinitely with time: perhaps a user might edit their
      photos into a yearly calendar and a once-a-decade photo book to share with
      friends and family. A photo library is a living digital artifact that the
      user works with intermittently and in diverse ways.
    </p>
    <p>
      <strong>Medium Data</strong>: The data in a photo manager is too
      voluminous to manage carelessly but still small enough to fit on a modern
      mobile device. We might call this <em>Medium Data</em>, in contrast to Big
      Data. With Medium Data, a user cannot exhaustively check that the data is
      not corrupted or damaged, since going through tens of thousands of records
      could take weeks. In contrast, manually checking that a project tracker is
      in a valid state could be done in a few minutes in almost all cases.
    </p>
    <p>
      <strong>Valuable data</strong>: Lastly, we note that photo libraries
      manage <em>immensely valuable</em> data. Much of the data is irreplaceable
      and a user must trust that the application won’t accidentally lose it.
      Furthermore, even the metadata of a photo library might represent hundreds
      or thousands of hours of creative effort. A photo library manager carries
      a heavy burden of responsibility to the user on matters of data integrity.
    </p>
    <p>
      We believe that these four properties—accretion over time, unbounded
      scope, medium size, and immense value—characterize an important class of
      applications that we call <em>digital gardens</em>.<a
        href="#fn1"
        class="footnote-ref"
        id="fnref1"
        role="doc-noteref"
        ><sup>1</sup></a
      >
      A user interacts with their digital garden repeatedly and intermittently
      over a long period of time, as one would plant, weed, and trim a garden.
      We think that many serious uses of library managers (for photos, music, or
      other artifacts) are central examples of digital gardens. Some people also
      express serious creative effort as they organize their files in a
      traditional files-and-folders filesystem browser, so we think that some
      uses of a filesystem would similarly qualify.
    </p>
    <h2 id="sec:example">Example scenario</h2>
    <p>
      In this section, we illustrate some of the challenges of syncing data for
      a digital garden. Alice and Bob are using an application that allows users
      to organize and edit a shared photo collection. It uses a local-first
      architecture that allows offline editing and syncs data when a network is
      available. A photo has two visual attributes: a saturation and contrast
      value. Additionally, users can create albums that contain references to
      photos; a photo can exist in multiple albums at once.
    </p>
     <pre><code>
      Photo (cont: int, sat: int)
      Album ( name: string, photos: Set&lt;Photo&gt; )
    </code></pre>
 <p>
      Alice and Bob are traveling home from a vacation. Before heading home,
      they synchronized all of their photos between their laptops. Now they can
      each spend their train ride home editing photos offline. Alice creates an
      album containing several dozen photos. She makes a bulk edit to all the
      photos in her album, reducing the contrast on all the photos to 70% to
      create a faded look. Meanwhile, Bob is performing his own edits. He
      creates his own album of several dozen photos, and then applies a bulk
      edit to all photos in the album, raising the saturation to 130% to make
      the colors more vibrant.
    </p>
    <p>
      Later, when Alice and Bob regain internet access, they synchronize their
      changes. It turns out that Alice and Bob chose some of the same photos to
      be included in both of their albums, which means that some of their
      actions affected an overlapping set of photos. How should these edits be
      merged? We present three options, shown in Figure 1.
    </p>
    <h4 id="independent-style-properties.">Independent style properties.</h4>
    <p>
      One solution is to minimize conflicts. We could model saturation and
      contrast for a given photo as two independent Last-Writer-Wins Registers
      <span class="citation" data-cites="shapiro2011"
        >[<a href="#ref-shapiro2011" role="doc-biblioref">13</a>]</span
      >. In this case, because Alice and Bob edited different properties, their
      writes do not even touch the same register and are trivially mergeable.
      Using this data model, the application can merge the two users’ changes
      without conflicts, and the users can view and edit their photos after
      merging.
    </p>
    <p>
      However, a week later, Alice is showing a slideshow of her album to some
      friends and notices that some of the photos look strange. The problem is
      that Alice and Bob’s edits to saturation and contrast were
      <em>both</em> applied to those photos, resulting in a visual result that
      neither user wanted. Alice hadn’t noticed this problem earlier upon
      merging, since there were too many photos to manually review.
    </p>
    <p>
      This sync system satisfied a useful property: after synchronizing, both
      users were able to continue editing, without needing to do any manual
      conflict resolution. However, the system failed to keep the data in a
      state that the users find acceptable. Neither user wanted to modify
      saturation or contrast in isolation; their judgement about the quality of
      the result depended on the value of the other parameters.
    </p>
    <h4 id="style-as-a-single-value.">Style as a single value.</h4>
    <p>
      Another option could be to treat the visual style of a photo as an atomic
      value. For example, we could use an LWW-Register CRDT to hold a value
      containing both the saturation and the contrast. This model does not allow
      concurrent edits to contrast and saturation to be merged together;
      instead, the system converges to contain either Alice or Bob’s preferred
      overall style for a photo, arbitrarily choosing one of their edits using a
      totally ordered property like a physical timestamp.
    </p>
    <p>
      We now avoid merging visual edits to the same photo, but there is still a
      problem. Imagine that the photo app has synchronized using this approach.
      A week after syncing with Alice, Bob is looking through his album and
      notices that some photos look very different from the others, ruining the
      visual uniformity of his album. The reason is that some of his edits have
      been overridden by Alice’s. This system did a better job preserving intent
      at the level of the individual photo, but it failed to preserve Bob’s
      higher-level intent: to <em>edit in bulk</em> all of the photos in an
      album to look the same way. Bulk edits are common in digital gardens, and
      so it is often important to reason about intent over groups of records
      rather than individual records in isolation.
    </p>
    <h4 id="sec:coarse-grained-transaction">Bulk edits.</h4>
    <p>
      To solve the above problem, we can consider further coarsening the
      granularity of our conflict detection. We can model editing all photos in
      an album as a “bulk action” that must atomically succeed or fail, to
      ensure a consistent visual look throughout the album. For example, this
      idea can be naturally implemented in a system like Bayou
      <span class="citation" data-cites="terry1995"
        >[<a href="#ref-terry1995" role="doc-biblioref">14</a>]</span
      >
      or IceCube
      <span class="citation" data-cites="kermarrec2001"
        >[<a href="#ref-kermarrec2001" role="doc-biblioref">7</a>]</span
      >, in which developers can describe domain events that execute
      transactionally, with application-specific logic for conflict detection
      and resolution. In this new model, Alice and Bob’s visual edits are
      incompatible; the system arbitrarily picks Alice’s write as the winner and
      discards the entirety of Bob’s bulk edit action as a conflict.
    </p>
    <p>
      This approach avoids the data integrity problems with the earlier
      solutions, but it creates a subpar user experience for Bob. Bob had
      planned to continue his editing work after he gets home. After
      synchronizing, he sees his careful editing work disappear from the UI
      because his entire bulk edit was discarded as a conflict. Of course, his
      edit actions may not be permanently lost—in this case the photo app allows
      him to recover them in a history view—but in order to do any work that
      builds on his changes, Bob must <em>first</em> do the manual conflict
      resolution work needed to bring his changes back into the application
      state. This coarse-grained transaction approach has achieved a stronger
      level of data integrity, but lost a valuable property from the earlier
      options: the ability for users to smoothly continue their work after
      synchronizing changes with another user.
    </p>
    <p>
      In sum, all three solutions are flawed in different ways. On the one hand,
      being overly permissive in merging changes results in data integrity
      problems that are difficult to detect and clean up. On the other hand,
      being overly conservative blocks users with conflict resolution work and
      prevents them from proceeding with their work.
    </p>
    <h1 id="sec:forking-histories">The forking histories model</h1>
    <p>
      Based on the scenario above, we claim that an ideal synchronization model
      for digital gardens would satisfy these three properties:
    </p>
    <h4 id="availability.">Availability.</h4>
    <p>
      Data can be edited freely offline, e.g. on mobile devices, while
      disconnected from other replicas.
    </p>
    <h4 id="data-integrity.">Data integrity.</h4>
    <p>
      The application carefully models user intent and avoids merging together
      changes in ways that might cause undetected problems.
    </p>
    <h4 id="deferred-conflict-resolution.">Deferred conflict resolution.</h4>
    <p>
      After exchanging edits, the application allows users to continue working
      freely, without first resolving all conflicts.
    </p>
    <h4 id="achieving-these-properties-with-forking-histories.">
      Achieving these properties with forking histories.
    </h4>
    <p>
      These properties are difficult to reconcile, but we propose a model of
      <em>forking histories</em> that achieves all three properties. The key
      insight is that all of the options presented in Section 2 share the
      assumption that the application should converge to a single shared state
      as soon as the users synchronize their changes. This assumption makes
      sense in some contexts like withdrawing from a bank balance or booking a
      meeting room, where it is useful to converge on a single state as quickly
      as possible. However, this assumption does not necessarily apply in a
      photo editing app. Alice and Bob would like to
      <em>eventually</em> converge, but they would rather choose when to do so,
      rather than be forced to converge immediately upon syncing. The idea is to
      “merge what you can, fork what you can’t.”
    </p>
    <p>
      <em>Merge what you can</em>: When user changes do not conflict, they
      should be automatically merged into a single shared state. The system
      should allow app developers to associate metadata with write events in a
      way that maximally captures user intent and relevant integrity
      constraints, so that automatic merges do not cause surprising results.
    </p>
    <p>
      <em>Fork what you can’t</em>: When user changes do conflict with one
      another in a way that the system cannot automatically resolve, the
      application state <em>forks</em> into multiple co-existing histories. The
      application UI displays the multiple histories across all users and
      devices, so everyone is aware that the fork has occurred. The system can
      still arbitrarily designate one history as the default across all
      replicas, but this is merely a lightweight tag.
    </p>
    <p>
      Users can switch to other histories and see those other states reflected
      in the application; they can even do further work in the application,
      extending that non-default history. Users can see diff views between
      histories and do manual work to reconcile events between them, and can
      manually designate any history as the new default view shown to all users.
      The physical action of sharing events between replicas has been decoupled
      from the logical action of merging those events into a common history.
      Instead, we have independent notions of event sharing: another user’s
      events can be <em>available</em> without having been <em>applied</em>.
    </p>
    <p>
      The forking histories model moves constraint checking from the write path
      to the read path. In a traditional, centralized transaction processor,
      constraints are maintained on write. This is impossible in a system with
      availability during network partitions. CRDTs avoid the issue by weakening
      integrity constraints, and Bayou/IceCube include conflict resolution logic
      to maintain constraints during late-arriving writes. In contrast, in a
      forking histories system, any write is allowed, but might only be visible
      from histories where it did not cause a conflict.
    </p>
    <h2 id="forking-histories-in-our-example">
      Forking histories in our example
    </h2>
    <p>
      How would a system based on the forking history model handle the example
      scenario in Section 2.1? The system creates both Alice and Bob’s albums in
      a single non-forked history, since album creation events do not conflict.
      However, the bulk edits of the photos contend on shared state, because the
      application developer has defined all edits of photo appearance metadata
      as conflicting. Since it can’t merge them, it forks starting from the last
      shared state and create two histories: one with Alice’s edits, and the
      other with Bob’s, illustrated in Figure 2. It arbitrarily chooses the
      history with Alice’s edits applied as the default.
    </p>
    <figure>
      <embed src="media/forking.pdf" />
      <figcaption aria-hidden="true">
        After syncing, the application state is forked into two histories, one
        where each user’s change was applied. The history with Alice’s change is
        tagged as the default. After the users manually reconcile, the albums no
        longer overlap.
      </figcaption>
    </figure>
    <p>
      After syncing, Bob sees these histories in his UI and decides that he does
      not want to deal with merging them quite yet. He clicks a toggle in the
      application to switch back to the one which contains only his edits, and
      not Alice’s. He continues to make further edits, building on his prior
      work.
    </p>
    <p>
      Later on, Alice and Bob decide that they are ready to incorporate Bob’s
      changes back into the main history, and they coordinate on a solution
      which Bob can execute on his history. First, he performs an undo on his
      bulk edit action. Next, he selects the photos in his album which overlap
      with Alice’s photos and replaces them with duplicated copies. Then, he
      re-executes his bulk edit action on the album with its new contents. After
      these adjustments, Bob’s history no longer contains any events that
      conflict with the main history, so he can safely merge it into the main
      history.
    </p>
    <p>
      As we can see, Alice and Bob still eventually converged to a single shared
      state. However, they were able to decide when to merge histories, which
      enabled them to maintain data consistency without being blocked from
      continuing their work.
    </p>
    <h2 id="sec:forking-design">Design considerations</h2>
    <p>
      The forking histories paradigm presents a tradeoff for users. It imposes a
      cost by requiring users to reason about multiple states of the application
      simultaneously. In exchange, users gain significant benefits: they can be
      confident in the integrity of their data, while always being able to
      access and edit their data offline. In a situation where data integrity
      isn’t particularly important or where incorrect merges can be easily
      corrected, the cost may outweigh the benefit. However, in the context of
      digital gardens we believe that the tradeoff is clearly worthwhile; it is
      better to give users an accurate view that acknowledges the challenges of
      maintaining data consistency than to pretend that data can always be
      automatically merged without issues.
    </p>
    <p>
      Programmers may be familiar with the benefits of forking history from
      using distributed version control systems (DVCSs) like Git and Mercurial,
      which are indeed instances of the forking histories model for data that
      can be represented as trees of text files. In fact, our proposed TreeDB
      can be seen as a generalization of Git’s commit graph using more general
      mechanisms for detecting and automatically reconciling conflicts,
      especially outside of the domain of plain text; we elaborate on this
      relationship in Section 5.1.1.2.
    </p>
    <p>
      However, DVCSs are also notoriously difficult to learn
      <span
        class="citation"
        data-cites="eraslan2020 perezderosso2013 derosso2016"
        >[<a href="#ref-derosso2016" role="doc-biblioref">4</a>,<a
          href="#ref-eraslan2020"
          role="doc-biblioref"
          >5</a
        >,<a href="#ref-perezderosso2013" role="doc-biblioref">11</a>]</span
      >, which raises another question: is it really possible for typical
      end-users to use a system with forking histories? While outside the scope
      of this paper, we think this presents an opportunity for HCI and design
      work—there are many possible interfaces for reasoning about diverging
      versions of the same data. Some of these interfaces are already deployed
      in industry: for example, Track Changes in Microsoft Word and Suggested
      Edits in Google Docs are UIs for reasoning about different versions of a
      text document, and the Figma collaborative drawing tool has a user
      interface for reconciling merge conflicts which shows live previews of
      conflicting UI elements.
    </p>
