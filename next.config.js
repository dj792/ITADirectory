/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        /*
         * The release notes are UNLISTED: reachable by anyone holding the link,
         * absent from search results. The page already carries a `noindex,
         * nofollow` meta tag; this header says the same thing to crawlers that
         * read headers and never parse the body, and it applies to the response
         * even if the HTML is served from a cache.
         *
         * There is deliberately NO robots.txt entry to go with it — a `Disallow`
         * line would publish the path to anyone who reads robots.txt, and a
         * disallowed page can't be crawled to discover its own `noindex`, so it
         * can still show up as a bare URL. Meta tag + header is the pair that
         * actually suppresses a page.
         */
        source: "/releaseNotes.html",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
