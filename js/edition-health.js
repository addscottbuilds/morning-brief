// Use the same Sydney edition rules before writing and after publication.
(() => {
  const day = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
  });
  function inspect(data, now = Date.now()) {
    const stamp = data?.generatedAt;
    const preparedAt = typeof stamp === "string" && /(?:Z|[+-]\d\d:\d\d)$/i.test(stamp)
      ? Date.parse(stamp) : NaN;
    const invalid = reason => ({ state: "invalid", reason, preparedAt });
    if (!Number.isFinite(preparedAt)) return invalid("Missing or invalid preparation time");
    if (preparedAt > now) return invalid("Preparation time is in the future");
    if (!Array.isArray(data.markets?.items)) return invalid("Missing market snapshot");
    const readable = stories => Array.isArray(stories) && stories.some(story =>
      typeof story?.headline === "string" && story.headline.trim().length > 0);
    const hasNews = Array.isArray(data.news?.categories)
      ? data.news.categories.some(category => readable(category?.stories))
      : readable(data.news?.stories);
    if (!hasNews) return invalid("No readable news headlines");
    return day.format(preparedAt) === day.format(now)
      ? { state: "current", reason: "Current Sydney edition", preparedAt }
      : { state: "previous", reason: "Previous Sydney edition", preparedAt };
  }
  globalThis.MorningBriefEdition = { inspect };
})();
