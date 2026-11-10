/* News edition rendering. The core app still owns digest loading and topic selection. */
(function () {
  "use strict";

  const clock = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  const relative = new Intl.RelativeTimeFormat("en-AU", { numeric: "always" });
  const releaseGroups = [
    ["movies", "Movies"],
    ["shows", "TV"],
    ["anime", "Anime"],
  ];
  const outletLabels = new Map([
    ["left", "Left-leaning outlet"],
    ["centre", "Centre outlet"],
    ["right", "Right-leaning outlet"],
  ]);

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function safeURL(value) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function renderImage(container, value) {
    if (!container) return;
    const url = safeURL(value);
    const previous = container.querySelector(".news-article-image");
    if (previous?.src === url) return;
    previous?.remove();
    container.classList.toggle("has-image", Boolean(url));
    if (!url) return;

    const image = make("img", "news-article-image");
    image.alt = "";
    image.width = 480;
    image.height = 270;
    image.loading = "lazy";
    image.decoding = "async";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("load", () => image.classList.add("is-loaded"), { once: true });
    image.addEventListener("error", () => {
      if (image.parentNode !== container) return;
      image.remove();
      container.classList.remove("has-image");
    }, { once: true });
    container.append(image);
    image.src = url;
  }

  function publishedTime(timestamp) {
    const date = new Date(timestamp);
    const time = date.getTime();
    if (!timestamp || !Number.isFinite(time)) return null;

    const minutes = Math.floor((Date.now() - time) / 60000);
    const absolute = clock.format(date);
    let label = absolute;
    if (minutes >= 0 && minutes < 1) label = "Just now";
    else if (minutes >= 1 && minutes < 60) label = relative.format(-minutes, "minute");
    else if (minutes >= 60 && minutes < 1440) label = relative.format(-Math.floor(minutes / 60), "hour");
    else if (minutes >= 1440 && minutes < 10080) label = relative.format(-Math.floor(minutes / 1440), "day");

    const stamp = make("time", "news-story-time", label);
    stamp.dateTime = date.toISOString();
    stamp.title = absolute;
    return stamp;
  }

  function summaryAttribution(story, mode) {
    // Unenriched stories keep a null comparison flag even in a partly generated edition.
    return mode === "llm" && typeof story.divergent === "boolean" ? "Generated summary" : "Publisher excerpt";
  }

  function summaryBlock(story, mode) {
    const block = make("div", "news-summary");
    block.append(
      make("p", "news-attribution", summaryAttribution(story, mode)),
      make("p", "news-summary-copy", story.summary),
    );
    return block;
  }

  function sourceItem(source, key) {
    const item = make("li", "news-source-item");
    const url = safeURL(source.link);
    const row = make(url ? "a" : "div", "news-source-row");
    if (url) {
      row.href = url;
      row.target = "_blank";
      row.rel = "noopener noreferrer";
      row.dataset.newsFocus = key + ":source:" + url;
    }

    const metadata = make("span", "news-source-meta");
    metadata.append(make("span", "news-source-name", source.outlet || "Source"));
    const lean = outletLabels.get(source.lean);
    if (lean) {
      const side = make("span", "news-outlet-label", lean);
      side.dataset.lean = source.lean;
      metadata.append(side);
    }
    row.append(metadata);
    if (source.title) row.append(make("span", "news-source-title", source.title));
    item.append(row);
    return item;
  }

  function coverageBlock(story, sources, mode, key, includeSummary) {
    const differences = story.divergent ? [
      ["Left-leaning outlets", story.left_view],
      ["Right-leaning outlets", story.right_view],
      ["Shared points", story.common_ground],
    ].filter(([, value]) => value) : [];
    if (!includeSummary && !sources.length && !differences.length) return null;

    const details = make("details", "news-coverage");
    details.dataset.newsDetail = key;
    let label = "Read the summary";
    if (sources.length > 1) label = "Compare " + sources.length + " sources";
    else if (sources.length) label = includeSummary ? "Read summary and source" : "View source";
    else if (differences.length) label = "See differences in coverage";
    const trigger = make("summary", "", label);
    trigger.dataset.newsFocus = key;
    details.append(trigger);

    const body = make("div", "news-coverage-body");
    if (includeSummary) body.append(summaryBlock(story, mode));

    if (differences.length) {
      const panel = make("div", "news-comparison");
      panel.append(make("p", "news-comparison-label", "How coverage differs"));
      if (mode === "llm") {
        panel.append(make("p", "news-attribution", "Generated comparison based on selected reporting."));
      }
      const views = make("dl", "news-views");
      for (const [name, content] of differences) {
        views.append(make("dt", "", name), make("dd", "", content));
      }
      panel.append(views);
      body.append(panel);
    }

    if (sources.length) {
      const list = make("ul", "news-sources");
      list.setAttribute("aria-label", "Coverage and original links");
      sources.forEach(source => list.append(sourceItem(source, key)));
      body.append(list);
      if (sources.some(source => outletLabels.has(source.lean))) {
        body.append(make("p", "news-coverage-note", "Outlet groupings are approximate and do not rate individual articles."));
      }
    }

    details.append(body);
    return details;
  }

  function storyCard(story, { index, topic, mode, newIds }) {
    const card = make("article", "news-article");
    if (story.id != null) card.dataset.newsStoryId = String(story.id);
    const lead = index === 0;
    if (lead) card.classList.add("is-lead");
    const sources = Array.isArray(story.sources) ? story.sources.filter(source => source && typeof source === "object") : [];
    // Feed ids describe rank in this edition, so compare the headline and reporting for refresh state.
    const original = sources.map(source => safeURL(source.link)).find(Boolean);
    const key = JSON.stringify([topic, story.headline, original || story.ts || index]);

    const metadata = make("div", "news-story-meta");
    if (newIds?.has(story.id)) metadata.append(make("span", "news-story-new", "New"));
    if (sources.length) {
      metadata.append(make("span", "", sources.length + (sources.length === 1 ? " source" : " sources")));
    }
    const time = publishedTime(story.ts);
    if (time) metadata.append(time);
    if (metadata.hasChildNodes()) card.append(metadata);

    const body = make("div", "news-article-body");
    const copy = make("div", "news-article-copy");
    const headline = make("h2", "news-headline", story.headline);
    headline.id = "news-headline-" + index;
    headline.tabIndex = -1;
    headline.dataset.newsFocus = key + ":headline";
    card.setAttribute("aria-labelledby", headline.id);
    copy.append(headline);
    if (lead && story.summary) copy.append(summaryBlock(story, mode));
    body.append(copy);

    renderImage(body, story.img);

    card.append(body);
    const coverage = coverageBlock(story, sources, mode, key, !lead && Boolean(story.summary));
    if (coverage) {
      coverage.firstElementChild.setAttribute("aria-describedby", headline.id);
      card.append(coverage);
    }
    return card;
  }

  function releasePanel(releases) {
    const groups = releaseGroups
      .map(([key, label]) => [key, label, releases?.[key]])
      .filter(([, , items]) => Array.isArray(items) && items.some(item => item?.title));
    if (!groups.length) return null;

    const panel = make("section", "news-releases");
    const title = make("h2", "news-release-heading", "Recent releases");
    title.id = "news-releases-title";
    panel.setAttribute("aria-labelledby", title.id);
    panel.append(title);

    const board = make("div", "news-release-groups");
    for (const [key, label, items] of groups) {
      const group = make("div", "news-release-group");
      group.append(make("h3", "", label));
      items.forEach((item, index) => {
        if (!item?.title) return;
        const details = make("details", "news-release-item");
        const detailKey = "release:" + key + ":" + item.title + ":" + index;
        details.dataset.newsDetail = detailKey;
        const trigger = make("summary");
        trigger.dataset.newsFocus = detailKey;
        const name = make("span", "news-release-name", item.title);
        if (item.year) name.append(make("span", "news-release-year", " (" + item.year + ")"));
        trigger.append(name);
        if (typeof item.rating === "number" && Number.isFinite(item.rating)) {
          const score = make("span", "news-release-rating", item.rating.toFixed(1));
          score.setAttribute("aria-label", "Rating " + item.rating.toFixed(1));
          trigger.append(score);
        }
        const description = make("div", "news-release-description");
        if (Array.isArray(item.genres) && item.genres.length) {
          description.append(make("p", "news-release-genres", item.genres.join(", ")));
        }
        description.append(make("p", "", item.overview || "No synopsis available."));
        details.append(trigger, description);
        group.append(details);
      });
      board.append(group);
    }
    panel.append(board, make("p", "news-release-source", "Ratings come from IMDb for movies and TV, and AniList for anime."));
    return panel;
  }

  function render({ list, status, category, mode, newIds, releases }) {
    const topic = category?.key || "";
    const stories = Array.isArray(category?.stories)
      ? category.stories.filter(story => typeof story?.headline === "string" && story.headline.trim())
      : [];

    // Preserve disclosures and focus when a background check refreshes the same topic.
    const unchangedTopic = list.dataset.newsTopic === topic;
    const open = unchangedTopic
      ? new Set(Array.from(list.querySelectorAll("details[open][data-news-detail]"), detail => detail.dataset.newsDetail))
      : new Set();
    const focused = unchangedTopic && list.contains(document.activeElement)
      ? document.activeElement.dataset.newsFocus
      : "";

    list.dataset.newsTopic = topic;
    list.dataset.newsState = stories.length ? "ready" : "empty";
    const content = document.createDocumentFragment();
    if (!stories.length) {
      content.append(make("p", "news-empty-state", category
        ? "No stories in this topic for this edition."
        : "This edition has no stories yet."));
    }
    stories.forEach((story, index) => content.append(storyCard(story, { index, topic, mode, newIds })));
    const releaseSection = releasePanel(releases);
    if (releaseSection) content.append(releaseSection);
    list.replaceChildren(content);

    for (const detail of list.querySelectorAll("[data-news-detail]")) {
      if (open.has(detail.dataset.newsDetail)) detail.open = true;
    }
    if (focused) {
      const match = Array.from(list.querySelectorAll("[data-news-focus]")).find(item => item.dataset.newsFocus === focused);
      match?.focus({ preventScroll: true });
    }
    if (status) {
      const noun = stories.length === 1 ? "story" : "stories";
      const label = category?.key === "top" ? "top " + noun
        : noun + (category?.label ? " in " + category.label : "");
      status.textContent = stories.length ? stories.length + " " + label : "No stories";
    }
  }

  function showUnavailable({ list, status }) {
    list.dataset.newsState = "unavailable";
    list.replaceChildren(make("p", "news-empty-state", "The news digest couldn’t load. Try again above."));
    if (status) status.textContent = "News unavailable";
  }

  function openStory(storyId) {
    if (storyId == null) return false;
    const list = document.getElementById("news-list");
    if (!list) return false;
    const card = Array.from(list.querySelectorAll("[data-news-story-id]"))
      .find(article => article.dataset.newsStoryId === String(storyId));
    const headline = card?.querySelector(".news-headline");
    if (!headline) return false;
    headline.focus({ preventScroll: true });
    card.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" });
    return true;
  }

  window.MorningBriefNews = { render, showUnavailable, openStory, summaryAttribution, renderImage };
})();
