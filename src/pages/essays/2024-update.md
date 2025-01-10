---
setup: |
  import Layout from '../../layouts/BlogPost.astro'
  import SubscriptionBox from '../../components/SubscriptionBox.astro'
  import Abstract from '../../components/Abstract.astro'
  import Aside from '../../components/Aside.astro'
  import { Markdown } from "astro/components";
title: The Riffle project has concluded
publishDate: 2024 Dec
draft: false
description: ""
previewImage: "assets/essays/prelude/reactive.png"
---

The Riffle research project has concluded!

The project started with a [vision](/prelude) of how app development could be made simpler.

After a couple years, we were able to substantially validate that this better way is possible. See our [paper published at UIST 2023](https://dl.acm.org/doi/10.1145/3586183.3606801) for more information on what we found.

The ideas of Riffle are being now carried forward in a commercial project. Johannes Schickling, part of the Riffle team, is developing on [LiveStore](https://livestore.dev), an open source data management system for web and mobile applications. It aims to productionize some of the ideas prototyped in Riffle, add a new synchronization approach based on event sourcing, and bring the ideas to more platforms. To hear more about Livestore, please check out the [early access form](https://forms.gle/wZ4pWJr8gJAEwpXW6).

We are grateful for the interest and support from the community for Riffle.