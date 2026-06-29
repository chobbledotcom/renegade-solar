---
title: News
description: "Updates from Renegade Solar: community projects, unusual solar jobs and places Ashley has been working around Greater Manchester."
permalink: /news/
layout: page.html
---

# News

Work we have been up to, especially the jobs and community projects that do not fit neatly on a service page.

{% assign posts = collections.news | sort: "data.date" | reverse %}
{% for post in posts %}

## [{{ post.data.link_title | default: post.data.title }}]({{ post.url }})

{{ post.data.date | date: "%-d %B %Y" }}

{{ post.data.description }}

{% endfor %}
